// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
	adapter: cloudflare({
		imageService: 'compile',
		inspectorPort: 0,
	}),
	integrations: [react()],
	devToolbar: {
		enabled: false,
	},
	output: 'server',
	site: 'https://tung.codes',
});
