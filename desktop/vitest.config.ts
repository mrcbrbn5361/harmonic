import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/renderer/components/queue.ts',
        'src/renderer/components/player.ts',
        'src/renderer/components/api-client.ts',
        'src/renderer/components/views.ts',
        'src/renderer/components/ui-feedback.ts',
        'src/renderer/components/song-row.ts',
        'src/renderer/components/transport.ts',
        'src/renderer/components/panels.ts',
      ],
    },
  },
});
