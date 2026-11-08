import {
  filesOfVersion,
  promptVersionIn,
  recordRelease,
  releaseProblems,
  sha256,
  unreleasedVersionProblem,
} from '../lib/prompt-release.ts';

const sources = ['lang/de.v1.md', 'lang/de.v2.md', 'reply.v1.md', 'reply.v2.md', 'user.v1.md'];
const files: Record<string, string> = {
  'lang/de.v1.md': 'de one',
  'lang/de.v2.md': 'de two',
  'reply.v1.md': 'reply one',
  'reply.v2.md': 'reply two',
  'user.v1.md': 'user one',
};

describe('prompt release manifest', () => {
  it('picks the files of one version only', () => {
    expect(filesOfVersion(sources, 'v1')).toEqual(['lang/de.v1.md', 'reply.v1.md', 'user.v1.md']);
    expect(filesOfVersion(sources, 'v2')).toEqual(['lang/de.v2.md', 'reply.v2.md']);
  });

  it('records a version and then reports no problems', () => {
    const manifest = recordRelease({}, 'v1', sources, (f) => files[f]!);
    expect(Object.keys(manifest.v1!)).toEqual(['lang/de.v1.md', 'reply.v1.md', 'user.v1.md']);
    expect(manifest.v1!['reply.v1.md']).toBe(sha256('reply one'));
    expect(releaseProblems(manifest, (f) => files[f] ?? null)).toEqual([]);
  });

  it('fails when a released file changed or was deleted; unreleased versions are free', () => {
    const manifest = recordRelease({}, 'v1', sources, (f) => files[f]!);
    const edited: Record<string, string> = {
      ...files,
      'reply.v1.md': 'reply one, edited',
      'reply.v2.md': 'anything',
    };
    delete edited['user.v1.md'];
    expect(releaseProblems(manifest, (f) => edited[f] ?? null)).toEqual([
      'reply.v1.md (released v1) changed; copy it to the next version instead',
      'user.v1.md (released v1) is missing',
    ]);
  });

  it('never re-records a released version or records an empty one', () => {
    const manifest = recordRelease({}, 'v1', sources, (f) => files[f]!);
    expect(() => recordRelease(manifest, 'v1', sources, (f) => files[f]!)).toThrow(
      'v1 is already released',
    );
    expect(() => recordRelease(manifest, 'v3', sources, (f) => files[f]!)).toThrow(
      'No *.v3.md prompt files',
    );
  });

  it('fails when a new file is added to a released version', () => {
    const manifest = recordRelease({}, 'v1', sources, (f) => files[f]!);
    const read = (f: string) => files[f] ?? null;
    expect(releaseProblems(manifest, read, sources)).toEqual([]);
    expect(releaseProblems(manifest, read, [...sources, 'lang/fr.v1.md', 'lang/fr.v2.md'])).toEqual(
      ['lang/fr.v1.md was added to released v1; put it in the next version'],
    );
  });

  it('requires the version the function sends to be released', () => {
    const manifest = recordRelease({}, 'v1', sources, (f) => files[f]!);
    expect(unreleasedVersionProblem(manifest, 'v1')).toBeNull();
    expect(unreleasedVersionProblem(manifest, 'v2')).toBe(
      'PROMPT_VERSION v2 is not released; run: node scripts/gen-prompts.ts --release v2',
    );
  });

  it('reads PROMPT_VERSION from prompts/index.ts', () => {
    expect(promptVersionIn("export const PROMPT_VERSION: PromptVersion = 'v4';")).toBe('v4');
    expect(promptVersionIn("export const PROMPT_VERSION = 'v1';")).toBe('v1');
    expect(() => promptVersionIn('const x = 1;')).toThrow('PROMPT_VERSION not found');
  });
});
