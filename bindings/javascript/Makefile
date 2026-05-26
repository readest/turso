pack-native:
	npm publish --dry-run && npm pack
pack-wasm:
	cp package.json package.native.json
	cp package.browser.json package.json
	npm publish --dry-run && npm pack; cp package.native.json package.json

publish-native:
	npm publish --access public
publish-wasm:
	cp package.json package.native.json
	cp package.browser.json package.json
	npm publish --access public; cp package.native.json package.json

publish-native-next:
	npm publish --tag next --access public
publish-wasm-next:
	cp package.json package.native.json
	cp package.browser.json package.json
	npm publish --tag next --access public; cp package.native.json package.json

release-wasm-fts:
	node readest-release.mjs

build-wasm-fts:
	yarn install
	WASM_FTS=1 npm run build --workspace=packages/common --workspace=packages/wasm-common --workspace=packages/wasm

test-wasm-fts:
	cd packages/wasm && CI=1 npx vitest --browser=chromium --run

publish-wasm-fts:
	cd packages/common && npm publish --tag next --access public
	cd packages/wasm-common && npm publish --tag next --access public
	cd packages/wasm && npm publish --tag next --access public
