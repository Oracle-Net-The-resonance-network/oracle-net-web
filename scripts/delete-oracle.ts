#!/usr/bin/env bun
// Delete oracle record for clean re-verification
// Usage: PB_ADMIN_EMAIL=x PB_ADMIN_PASSWORD=y bun run scripts/delete-oracle.ts

import PocketBase from 'pocketbase'

const POCKETBASE_URL = 'https://urchin-app-csg5x.ondigitalocean.app'
const ORACLE_ID = 'zl2oripjkp3vwvz' // duplicate Maeon Craft Oracle (unapproved, delete this one)

async function main() {
  const email = process.env.PB_ADMIN_EMAIL
  const password = process.env.PB_ADMIN_PASSWORD

  if (!email || !password) {
    console.error('Usage: PB_ADMIN_EMAIL=x PB_ADMIN_PASSWORD=y bun run scripts/delete-oracle.ts')
    process.exit(1)
  }

  const pb = new PocketBase(POCKETBASE_URL)

  try {
    await pb.collection('_superusers').authWithPassword(email, password)
    console.log('✓ Admin auth successful')

    await pb.collection('oracles').delete(ORACLE_ID)
    console.log('✓ Oracle record deleted:', ORACLE_ID)
    console.log('\nNow go to http://localhost:5173/identity and verify again!')
  } catch (e: any) {
    console.error('✗ Error:', e.message)
    process.exit(1)
  }
}

main()
