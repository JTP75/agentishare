"""Demo script showing how to use the configuration module."""

from src.config import ConfigLoader, Keys, Sections

def main():
    
    # NOTE
    # This implementation is only for demonstrating config functions. Delete as necessary.
    
    print("Config Demo")
    print()

    config = ConfigLoader()

    # Access values using constants (type-safe)
    print("=== Using constants ===")
    
    server_host = config.get(Sections.SERVER, Keys.HOST)
    server_port = config.get_int(Sections.SERVER, Keys.PORT)
    
    db_host = config.get(Sections.DATABASE, Keys.HOST)
    db_port = config.get(Sections.DATABASE, Keys.PORT)
    
    print(f"Server:     {server_host}:{server_port}")
    print(f"Database:   {db_host}:{db_port}")

if __name__ == "__main__":
    main()
