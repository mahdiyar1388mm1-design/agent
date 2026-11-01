export type BranchKey =
  | 'governance'
  | 'holding'
  | 'trading'
  | 'development'
  | 'marketing'
  | 'workforce'
  | 'intercompany'
  | 'treasury'
  | 'infrastructure'

export interface RawAgent {
  name: string
  fa: string
  note?: string
}

export interface RawSection {
  name: string
  fa: string
  short?: string
  desc?: string
  agents: RawAgent[]
}

export interface RawBranch {
  key: BranchKey
  name: string
  fa: string
  desc: string
  kind: 'board' | 'staff' | 'company' | 'machine' | 'bridge' | 'money' | 'infra'
  sections: RawSection[]
}

/** Builders that keep the roster data readable. */
export const a = (name: string, fa: string, note?: string): RawAgent => ({ name, fa, note })

export const s = (
  name: string,
  fa: string,
  agents: RawAgent[],
  desc?: string,
  short?: string,
): RawSection => ({ name, fa, agents, desc, short })
