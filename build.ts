// Build dist
import {build} from 'bun'

await build({
  entrypoints: ['./web/index.html', './web/sw.ts'],
  outdir: './out'
})

await build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist'
})
