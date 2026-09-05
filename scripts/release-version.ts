export function releaseVersion(current: string, bump: string | undefined, channel: string | undefined) {
  if (bump !== 'patch' && bump !== 'minor' && bump !== 'major') {
    throw new Error('RELEASE_BUMP must be patch, minor, or major')
  }
  if (channel !== 'stable' && channel !== 'next') {
    throw new Error('RELEASE_CHANNEL must be stable or next')
  }
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-next\.(0|[1-9]\d*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(current)
  if (!match) throw new Error(`Expected a stable or next.N package version: ${current}`)
  let [major, minor, patch] = match.slice(1, 4).map(BigInt)
  const prerelease = match[4]
  if (prerelease === undefined) {
    if (bump === 'major') { major++; minor = 0n; patch = 0n }
    else if (bump === 'minor') { minor++; patch = 0n }
    else patch++
  }
  const base = `${major}.${minor}.${patch}`
  return channel === 'stable' ? base : `${base}-next.${prerelease === undefined ? 1n : BigInt(prerelease) + 1n}`
}
