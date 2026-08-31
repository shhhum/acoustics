.PHONY: setup test dev api ui

# The repo lives in Dropbox, which re-materializes files and breaks the code
# signatures of compiled extensions (numpy/scipy .so), and litters .venv with
# "conflicted copy" files. Marking .venv with the FileProvider ignore xattr
# keeps Dropbox out of it. Harmless no-op off macOS.
setup:
	mkdir -p sim/.venv
	-@xattr -w "com.apple.fileprovider.ignore#P" 1 sim/.venv 2>/dev/null || true
	cd sim && uv sync --extra dev
	@if [ -f ui/package.json ]; then cd ui && npm install; fi

test:
	cd sim && uv run pytest -q

api:
	cd sim && uv run uvicorn soundroom.api:app --port 8765 --reload

ui:
	cd ui && npm run dev

dev:
	./scripts/dev.sh
