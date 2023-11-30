# Libraries

import psutil
import subprocess
import time
import os
import yaml
import logging
import pandas as pd

# Paths

base_in_dir = "/mnt/data/pubwww_seed_url_og/advertising/sorted/high/"
base_out_dir = "/mnt/data/pubwww_seed_url_og/advertising/crawled/test/"
log_dir = "./logs/"
base_crawler_dir = "./ls_input_crawler/"
config_file_path = base_crawler_dir + "config/default.yaml"

# Grabbing all files in base_in_dir

fn_list = os.listdir(base_in_dir)
fn_num_list = []

# Sorting files in base_in_dir to list

for fn in fn_list:
    fn_num_list.append(int(fn.split(".")[0][1:]))
    
df = pd.DataFrame(zip(fn_list, fn_num_list), columns=["fn", "num"])
df = df.sort_values(by="num")

fn_list_s = list(df["fn"])

# Looping through each file of urls

for fn in fn_list_s:
    
    # Logging setup
    logger = logging.getLogger('logger')
    logger.setLevel(logging.DEBUG)
    log_path = log_dir + fn.split(".")[0] + '.log'
    handler = logging.FileHandler(log_path, mode='a+')
    formatter = logging.Formatter("%(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    in_path = base_in_dir + fn
        
    logger.debug("cleaning checkpoint dir...")
    logger.debug("file currently running: " + in_path)
    
    os.system(f"cd {base_crawler_dir} && node clean.js")
    
    # Load the YAML cfg from the file
    with open(config_file_path, "r") as yf:
        cfg = yaml.safe_load(yf)
        
    cfg["paths"]["uri_input_path"] = in_path
        
    # Write the updated cfg back to the file
    with open(config_file_path, "w+") as yf:
        yaml.dump(cfg, yf, default_flow_style=False)
         
    

    # Script name to monitor 
    script_name = "ss_crawler.js"

    while True:
        # Check if the script is running
        script_running = False

        for process in psutil.process_iter(attrs=['pid', 'name']):
            if script_name in process.info['name']:
                script_running = True
                break
            
        if os.path.exists(base_out_dir + fn.split(".")[0] + "__exp.txt"):
            break
        
        if not script_running:
            logger.debug(f"{script_name} is not running. Restarting...")
            logger.debug("###############################################")
            
            try:
                cmd = f"cd {base_crawler_dir} && node {script_name}"
                logger.debug(cmd)

                # Redirect both stdout and stderr to a log file
                with open(log_path, 'a') as log_file:
                    subprocess.run(cmd, shell=True, stdout=log_file, stderr=subprocess.STDOUT, text=True)
                    
                logger.debug(fn + " complete successfully!")
                    
            except Exception as e:
                logger.debug(f"Error restarting {script_name}: {e}")
            
            finally:
                logger.debug("###############################################")
