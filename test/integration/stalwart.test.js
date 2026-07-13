import { vi, describe, it, expect, beforeEach } from 'vitest'

// Hoist mocks before any imports
vi.mock('axios', () => {
  const get = vi.fn()
  const create = vi.fn()
  return { default: { get, create } }
})

vi.mock('../../src/config.js', () => ({
  default: { stalwartUrl: 'https://stalwart.example.com' },
}))

vi.mock('../../src/logger.js', () => ({ log: vi.fn() }))

import axios from 'axios'
import { addAliasToStalwart } from '../../src/stalwart.js'

const VALID_SESSION = {
  apiUrl: 'https://stalwart.example.com/jmap',
  primaryAccounts: { 'urn:stalwart:jmap': 'account1' },
}

const VALID_SET_RESPONSE = {
  methodResponses: [
    [
      'x:MaskedEmail/set',
      {
        created: { new1: { email: 'alias@example.com', id: 'srv-id-1' } },
        notCreated: {},
      },
      'c1',
    ],
  ],
}

describe('addAliasToStalwart', () => {
  let mockPost

  beforeEach(() => {
    vi.clearAllMocks()
    mockPost = vi.fn()
    axios.create.mockReturnValue({ post: mockPost })
  })

  describe('discoverJmapSession — auth failures', () => {
    it('throws a clear auth error on HTTP 401', async () => {
      axios.get.mockResolvedValue({ status: 401, data: {} })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'Stalwart authentication failed (HTTP 401)'
      )
    })

    it('throws a clear auth error on HTTP 403', async () => {
      axios.get.mockResolvedValue({ status: 403, data: {} })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'Stalwart authentication failed (HTTP 403)'
      )
    })

    it('throws immediately on first 401 without trying the second path', async () => {
      axios.get.mockResolvedValue({ status: 401, data: {} })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow()
      expect(axios.get).toHaveBeenCalledTimes(1)
    })
  })

  describe('discoverJmapSession — path fallback', () => {
    it('tries both paths and throws discovery error when all return non-200', async () => {
      axios.get.mockResolvedValue({ status: 404, data: {} })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'JMAP session discovery failed'
      )
      expect(axios.get).toHaveBeenCalledTimes(2)
    })

    it('continues to next path on network error (ECONNREFUSED)', async () => {
      const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      axios.get.mockRejectedValue(err)
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'JMAP session discovery failed'
      )
      expect(axios.get).toHaveBeenCalledTimes(2)
    })

    it('succeeds on the second path when the first returns 404', async () => {
      axios.get
        .mockResolvedValueOnce({ status: 404, data: {} })
        .mockResolvedValueOnce({ status: 200, data: VALID_SESSION })
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      const result = await addAliasToStalwart('example.com', 'token')
      expect(result.email).toBe('alias@example.com')
    })
  })

  describe('discoverJmapSession — payload validation', () => {
    it('throws when session contains no account IDs', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { apiUrl: '/jmap', primaryAccounts: {}, accounts: null },
      })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'no account IDs'
      )
    })

    it('falls back to first key in accounts when primaryAccounts is absent', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { apiUrl: '/jmap', accounts: { 'acct-fallback': {} } },
      })
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      const result = await addAliasToStalwart('example.com', 'token')
      expect(result.email).toBe('alias@example.com')
    })

    it('rewrites a relative apiUrl using the configured origin', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { apiUrl: '/jmap', primaryAccounts: { 'urn:stalwart:jmap': 'account1' } },
      })
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      await addAliasToStalwart('example.com', 'token')
      expect(mockPost).toHaveBeenCalledWith(
        'https://stalwart.example.com/jmap',
        expect.any(Object)
      )
    })

    it('rewrites an absolute apiUrl that uses a different host', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: {
          apiUrl: 'http://internal-host:9990/jmap',
          primaryAccounts: { 'urn:stalwart:jmap': 'account1' },
        },
      })
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      await addAliasToStalwart('example.com', 'token')
      expect(mockPost).toHaveBeenCalledWith(
        'https://stalwart.example.com/jmap',
        expect.any(Object)
      )
    })
  })

  describe('MaskedEmail/set success path', () => {
    beforeEach(() => {
      axios.get.mockResolvedValue({ status: 200, data: VALID_SESSION })
    })

    it('returns email and server-assigned id', async () => {
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      const result = await addAliasToStalwart('example.com', 'token')
      expect(result).toEqual({ email: 'alias@example.com', id: 'srv-id-1' })
    })

    it('prepends Bearer to a bare token', async () => {
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      await addAliasToStalwart('example.com', 'mytoken')
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mytoken' }),
        })
      )
    })

    it('does not double-prepend Bearer when token already starts with it', async () => {
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      await addAliasToStalwart('example.com', 'Bearer mytoken')
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mytoken' }),
        })
      )
    })

    it('throws when notCreated contains the alias', async () => {
      mockPost.mockResolvedValue({
        status: 200,
        data: {
          methodResponses: [
            [
              'x:MaskedEmail/set',
              { notCreated: { new1: { description: 'Domain not allowed' } }, created: {} },
              'c1',
            ],
          ],
        },
      })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'Domain not allowed'
      )
    })

    it('throws when JMAP returns an error method response', async () => {
      mockPost.mockResolvedValue({
        status: 200,
        data: {
          methodResponses: [['error', { type: 'serverFail', description: 'internal error' }, 'c1']],
        },
      })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'serverFail'
      )
    })
  })

  describe('addAliasToStalwart — guards', () => {
    it('throws when no token is provided', async () => {
      await expect(addAliasToStalwart('example.com', '')).rejects.toThrow(
        'Stalwart API token is required'
      )
    })
  })
})
