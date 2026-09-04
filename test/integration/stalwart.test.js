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
        'Stalwart rejected the API key (HTTP 401)'
      )
    })

    it('throws a clear auth error on HTTP 403', async () => {
      axios.get.mockResolvedValue({ status: 403, data: {} })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        'Stalwart rejected the API key (HTTP 403)'
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
    // accountId is server-derived from the credentials, so a session that
    // advertises none is still usable — an API-key principal often has none.
    it('succeeds when the session advertises no account IDs', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { apiUrl: '/jmap', primaryAccounts: {}, accounts: null },
      })
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      const result = await addAliasToStalwart('example.com', 'token')
      expect(result.email).toBe('alias@example.com')
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

    it('sends the x:MaskedEmail/set shape documented by Stalwart', async () => {
      mockPost.mockResolvedValue({ status: 200, data: VALID_SET_RESPONSE })
      await addAliasToStalwart('example.com', 'token', 'github.com', {
        forDomain: 'github.com',
        url: 'https://github.com',
        emailPrefix: 'github',
      })

      const [, body] = mockPost.mock.calls[0]
      expect(body.using).toEqual(['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'])

      const [method, args, callId] = body.methodCalls[0]
      expect(method).toBe('x:MaskedEmail/set')
      expect(callId).toBe('c1')
      // accountId and createdBy are set by the server from the authenticating
      // credentials; sending them is not part of the documented create shape.
      expect(args).not.toHaveProperty('accountId')
      expect(args.create.new1).not.toHaveProperty('createdBy')
      expect(args.create.new1).toEqual({
        enabled: true,
        emailDomain: 'example.com',
        description: 'github.com',
        emailPrefix: 'github',
        forDomain: 'github.com',
        url: 'https://github.com',
      })
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

  describe('MaskedEmail/set — request-level failures', () => {
    beforeEach(() => {
      axios.get.mockResolvedValue({ status: 200, data: VALID_SESSION })
    })

    it('reports a 401 on the JMAP POST as a rejected API key', async () => {
      mockPost.mockRejectedValue({
        response: { status: 401, data: { title: 'Unauthorized', detail: 'Invalid credentials.' } },
        message: 'Request failed with status code 401',
      })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        /Stalwart rejected the API key \(HTTP 401\).*Invalid credentials/
      )
    })

    it('names the missing permission on a 403', async () => {
      mockPost.mockRejectedValue({
        response: { status: 403, data: { title: 'Forbidden', detail: 'Permission denied.' } },
        message: 'Request failed with status code 403',
      })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toThrow(
        /sysMaskedEmailCreate/
      )
    })

    it('attaches the upstream status so the HTTP layer can forward it', async () => {
      mockPost.mockRejectedValue({
        response: { status: 403, data: {} },
        message: 'Request failed with status code 403',
      })
      await expect(addAliasToStalwart('example.com', 'token')).rejects.toMatchObject({
        status: 403,
      })
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
