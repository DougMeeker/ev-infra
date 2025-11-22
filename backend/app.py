from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

# Load config
app.config.from_object("config.Config")

# Import models
import backend.app.models as models

@app.route("/")
def index():
    return {"message": "EV Infrastructure API is running"}

if __name__ == "__main__":
    app.run(debug=True)
