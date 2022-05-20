import React from 'react'

type LiveCodeHandles = {
  load(files: Record<string, string>): void
  ref: React.Ref
  error?: unknown
}

type Options = {
  getModulePath(modulePath: string): string
}

export function useLiveCode(options: Options): LiveCodeHandles
