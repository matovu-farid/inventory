import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('application branding assets', () => {
  it('does not serve the legacy React favicon', async () => {
    const favicon = await readFile(resolve(projectRoot, 'public/favicon.ico'))

    expect(favicon.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]))
    expect(createHash('sha256').update(favicon).digest('hex')).not.toBe(
      '3d10f7da6c603178340081668c4ac5b3ae9743ca9a262ab0fcd312fbb9f48bdd',
    )
  })

  it('does not reference the legacy React logo files', async () => {
    const legacyHashes = {
      'logo192.png':
        'c386396ec70db3608075b5fbfaac4ab1ccaa86ba05a68ab393ec551eb66c3e00',
      'logo512.png':
        '9ea4f4da7050c0cc408926f6a39c253624e9babb1d43c7977cd821445a60b461',
    }

    for (const [filename, legacyHash] of Object.entries(legacyHashes)) {
      const asset = await readFile(resolve(projectRoot, 'public', filename))

      expect(createHash('sha256').update(asset).digest('hex')).not.toBe(
        legacyHash,
      )
    }
  })

  it('uses Inventory branding in the install manifest', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(projectRoot, 'public/manifest.json'), 'utf8'),
    ) as {
      short_name: string
      name: string
      icons: Array<{ src: string }>
    }

    expect(manifest.short_name).toBe('Inventory')
    expect(manifest.name).toBe('Inventory Management')
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      'favicon.ico',
      'logo192.png',
      'logo512.png',
    ])
  })
})
