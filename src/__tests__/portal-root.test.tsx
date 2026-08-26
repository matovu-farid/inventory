// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PortalRoot } from '#/components/ui/portal-root'

afterEach(cleanup)

describe('PortalRoot', () => {
  it('provides the mount point required by overlay editors', () => {
    render(<PortalRoot />)

    expect(document.getElementById('portal')).not.toBeNull()
  })
})
