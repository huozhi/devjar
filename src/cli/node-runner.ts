import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

export type RunnerName = 'prerender-runner' | 'tailwind-runner'

/** Every runner receives these, plus its own input. */
export type RunnerInput = {
  loader: string
  outputPath: string
}

// Built runners sit next to the CLI bundle. A source checkout runs the
// TypeScript directly; Node 22 strips the types.
const fromSource = import.meta.url.endsWith('.ts')

function runnerUrl(name: RunnerName | 'http-loader') {
  return new URL(fromSource ? `./runners/${name}.ts` : `./${name}.mjs`, import.meta.url)
}

function nodeExecutable() {
  const versions = process.versions as NodeJS.ProcessVersions & { bun?: string }
  return versions.bun ? 'node' : process.execPath
}

export type RunNodeOptions = {
  /** Temporary directory owned by the caller; input and output files go here. */
  directory: string
  /** Show the runner's console output, such as logs from prerendered pages. */
  forwardOutput: boolean
}

/** Runs a runner in a separate Node process and returns the JSON it writes. */
export async function runNode<Output>(name: RunnerName, input: object, options: RunNodeOptions): Promise<Output> {
  const inputPath = join(options.directory, `${name}-input.json`)
  const outputPath = join(options.directory, `${name}-output.json`)
  const shared: RunnerInput = { loader: runnerUrl('http-loader').href, outputPath }
  await writeFile(inputPath, JSON.stringify({ ...input, ...shared }))
  const running = promisify(execFile)(nodeExecutable(), ['--no-warnings', fileURLToPath(runnerUrl(name)), inputPath], {
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'production' },
  })
  if (options.forwardOutput) {
    running.child.stdout?.on('data', chunk => process.stdout.write(chunk))
    running.child.stderr?.on('data', chunk => process.stderr.write(chunk))
  }
  try {
    await running
  } catch (error) {
    const stderr = (error as Error & { stderr?: string }).stderr?.trim()
    throw new Error(stderr || (error instanceof Error ? error.message : String(error)))
  }
  return JSON.parse(await readFile(outputPath, 'utf8')) as Output
}
