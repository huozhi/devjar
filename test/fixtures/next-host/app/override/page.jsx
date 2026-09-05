import Playground from '../playground'

const compiler = {
  workerUrl: '/compiler/worker',
  bindingUrl: '/compiler/binding',
  wasmUrl: '/compiler/wasm',
}

export default function Page() {
  return <Playground compiler={compiler} />
}
