.PHONY: setup test dev api ui

setup:
	cd sim && uv sync --extra dev
	@if [ -f ui/package.json ]; then cd ui && npm install; fi

test:
	cd sim && uv run pytest -q

api:
	cd sim && uv run uvicorn soundroom.api:app --port 8765 --reload

ui:
	cd ui && npm run dev

dev:
	@echo "run 'make api' and 'make ui' in two terminals"
