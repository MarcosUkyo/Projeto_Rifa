"""Inicia o servidor local: python run.py"""

import os
import threading
import webbrowser

from backend import create_app

app = create_app()

if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 5000))
    reiniciando = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if os.environ.get("RIFA_NAVEGADOR", "1") == "1" and not reiniciando:
        threading.Timer(1, lambda: webbrowser.open(f"http://localhost:{porta}")).start()
    app.run(host="127.0.0.1", port=porta, debug=os.environ.get("RIFA_DEBUG") == "1")
