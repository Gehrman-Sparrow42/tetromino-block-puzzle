import json
import os
import subprocess
import shutil

CONFIG_FILE = "variations.json"
ENV_FILE = ".env"
BUILD_DIR = "builds"
DIST_FILE = os.path.join("dist", "index.html")

def main():
    if not os.path.exists(CONFIG_FILE):
        print(f"Error: {CONFIG_FILE} not found. Creating a template.")
        template = {
            "default_neon": {
                "VITE_START_LEVEL": "1",
                "VITE_HARD_DROP_BONUS": "2",
                "VITE_COLOR_I": "0x00FFFF",
                "VITE_COLOR_T": "0xFF00FF"
            },
            "hardcore_mode": {
                "VITE_START_LEVEL": "10",
                "VITE_HARD_DROP_BONUS": "5",
                "VITE_COLOR_I": "0xFF0000",
                "VITE_COLOR_T": "0xFF0000"
            }
        }
        with open(CONFIG_FILE, "w") as f:
            json.dump(template, f, indent=4)
        return

    with open(CONFIG_FILE, "r") as f:
        variations = json.load(f)

    if not os.path.exists(BUILD_DIR):
        os.makedirs(BUILD_DIR)

    for name, config in variations.items():
        print(f"\n--- Building Variation: {name} ---")
        
        # 1. Inject variables into .env
        with open(ENV_FILE, "w") as f:
            for key, value in config.items():
                f.write(f"{key}={value}\n")
        
        # 2. Run Vite build
        print("Running 'npm run build'...")
        result = subprocess.run(["npm", "run", "build"], shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"Build failed for {name}!")
            print(result.stderr)
            continue
            
        # 3. Rename output file
        if os.path.exists(DIST_FILE):
            output_name = os.path.join(BUILD_DIR, f"{name}.html")
            shutil.copy(DIST_FILE, output_name)
            print(f"Success! Output saved to {output_name}")
        else:
            print(f"Error: {DIST_FILE} not found after build.")

if __name__ == "__main__":
    main()
