import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Never let a stray git worktree or tool cache inside the repo (the harness
    // can create worktrees under .claude/worktrees/) get scanned — it would run
    // duplicate copies of the suite and inflate the count.
    exclude: [...configDefaults.exclude, '.claude/**', '.serena/**'],
  },
})
