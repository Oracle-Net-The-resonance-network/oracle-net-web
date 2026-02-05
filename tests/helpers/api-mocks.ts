/**
 * API Mocking Helpers for E2E Tests
 *
 * Mock Oracle Universe API endpoints to:
 * - Avoid rate limits
 * - Test edge cases (errors, timeouts)
 * - Make tests deterministic
 */

import type { Page, Route } from '@playwright/test'

// ============================================
// GitHub API Mocks (via Oracle Universe API proxy)
// ============================================

export interface GitHubIssueMock {
  number: number
  title: string
  body: string
  author: string
  state: 'open' | 'closed'
}

/**
 * Mock GitHub Issues API (via Oracle Universe API proxy)
 */
export async function mockGitHubIssues(page: Page, issues: Record<string, GitHubIssueMock>) {
  await page.route('**/api/github/issues/*/*/**', async (route: Route) => {
    const url = route.request().url()
    const match = url.match(/api\/github\/issues\/([^/]+)\/([^/]+)\/(\d+)/)

    if (match) {
      const [, owner, repo, issueNum] = match
      const key = `${owner}/${repo}/${issueNum}`
      const issue = issues[key]

      if (issue) {
        console.log('[Mock] GitHub issue found:', key)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(issue),
        })
      } else {
        console.log('[Mock] GitHub issue not found:', key)
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not Found' }),
        })
      }
    } else {
      await route.continue()
    }
  })
}

/**
 * Default test issues
 */
export const TEST_ISSUES: Record<string, GitHubIssueMock> = {
  // SHRIMP Oracle birth issue
  'Soul-Brews-Studio/oracle-v2/121': {
    number: 121,
    title: 'SHRIMP Oracle Awakens',
    body: 'Oracle birth announcement',
    author: 'nazt',
    state: 'open',
  },
  // Verification issue (test wallet)
  'Soul-Brews-Studio/oracle-v2/999': {
    number: 999,
    title: 'Verify: Test Wallet',
    body: 'wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    author: 'test-user',
    state: 'open',
  },
  // Verification issue in oracle-identity repo
  'Soul-Brews-Studio/oracle-identity/999': {
    number: 999,
    title: 'Verify: Test Wallet',
    body: 'wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    author: 'test-user',
    state: 'open',
  },
}

// ============================================
// Verify Identity API Mocks
// ============================================

export interface VerifyIdentityResponse {
  success: boolean
  error?: string
  github_username?: string
  oracle_name?: string
  oracle?: { id: string; name: string }
  human?: { id: string; github_username: string }
  token?: string
}

/**
 * Mock verify-identity endpoint (via Oracle Universe API)
 */
export async function mockVerifyIdentity(
  page: Page,
  response: VerifyIdentityResponse | ((body: any) => VerifyIdentityResponse)
) {
  await page.route('**/api/auth/verify-identity', async (route: Route) => {
    const request = route.request()

    if (request.method() === 'POST') {
      let responseData: VerifyIdentityResponse

      if (typeof response === 'function') {
        const body = JSON.parse(request.postData() || '{}')
        responseData = response(body)
      } else {
        responseData = response
      }

      console.log('[Mock] verify-identity:', responseData.success ? 'SUCCESS' : 'ERROR')

      await route.fulfill({
        status: responseData.success ? 200 : 400,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      })
    } else {
      await route.continue()
    }
  })
}

/**
 * Mock successful verification
 */
export function mockSuccessfulVerification(page: Page, oracleName: string = 'Test Oracle') {
  return mockVerifyIdentity(page, {
    success: true,
    github_username: 'test-user',
    oracle_name: oracleName,
    oracle: {
      id: 'test-oracle-id',
      name: oracleName,
    },
    human: {
      id: 'test-human-id',
      github_username: 'test-user',
    },
    token: 'mock-jwt-token-for-testing',
  } as any)
}

/**
 * Mock verification failure
 */
export function mockFailedVerification(page: Page, error: string = 'Verification failed') {
  return mockVerifyIdentity(page, {
    success: false,
    error,
  })
}

// ============================================
// Combined Setup
// ============================================

/**
 * Setup all mocks for testing
 */
export async function setupAllMocks(page: Page) {
  await mockGitHubIssues(page, TEST_ISSUES)
  // Don't mock verify-identity by default - let tests choose
}

/**
 * Setup mocks for fully isolated testing (no external calls)
 */
export async function setupIsolatedMocks(page: Page, oracleName: string = 'Test Oracle') {
  await mockGitHubIssues(page, TEST_ISSUES)
  await mockSuccessfulVerification(page, oracleName)
}
