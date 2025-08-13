// Build dist
import {build} from 'bun'

await build({
  entrypoints: ['./web/index.html'],
  outdir: './out'
})

await build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist'
})
