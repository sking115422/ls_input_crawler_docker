import psutil
import subprocess
import time
import os
import yaml

base_in_dir = "/mnt/lts/nis_lab_research/data/pubwww_seed_url_og/advertising/sorted/high/"
base_out_dir = "/mnt/lts/nis_lab_research/data/pubwww_seed_url_og/advertising/crawled/test/"
config_file_path = "/mnt/lts/nis_lab_research/ls_input_crawler/config/default.yaml"

file_name_list = os.listdir(base_in_dir)

for fn in file_name_list:
    
    print("cleaning checkpoint dir...")
    os.system("node /mnt/lts/nis_lab_research/ls_input_crawler/clean.js")
    
    in_path = base_in_dir + fn
    
    # Load the YAML cfg from the file
    with open(config_file_path, "r") as yf:
        cfg = yaml.safe_load(yf)
        
    cfg["paths"]["uri_input_path"]: in_path
    
    # Write the updated cfg back to the file
    with open(config_file_path, "w+") as yf:
        yaml.dump(cfg, yf, default_flow_style=False)
        
    print("file currently running:", in_path)

    # Script name to monitor 
    script_name = "/mnt/lts/nis_lab_research/ls_input_crawler/ss_crawler.js"

    while True:
        # Check if the script is running
        script_running = False

        for process in psutil.process_iter(attrs=['pid', 'name']):
            if script_name in process.info['name']:
                script_running = True
                break

        if not script_running:
            print(f"{script_name} is not running. Restarting...")
            try:
                # Replace the command with the appropriate way to start your script
                subprocess.Popen(["node", script_name])
            except Exception as e:
                print(f"Error restarting {script_name}: {e}")
                
        if os.path.exists(base_out_dir + fn.split(".")[0] + "__exp.txt"):
            break

        time.sleep(60)  # Check every 60 seconds (adjust as needed)