from flask import Flask

def create_app():
    app = Flask(__name__,
                template_folder='../templates',
                static_folder='../static')
    app.config['SECRET_KEY'] = 'api-discovery-secret-key'

    from app.routes import main
    app.register_blueprint(main)

    return app
