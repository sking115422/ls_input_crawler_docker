// Importing Libraries
const YAML = require('yaml')
const fs = require('fs')

let f = fs.readFileSync('./config/default.yaml', 'utf8')
let fy = YAML.parse(f)

let uri_output_dir_ = fy.paths.uri_output_dir
let ckpt_dir_ = fy.paths.ckpt_dir

// // Cleaing Output Dir
// let output_dir_list = fs.readdirSync(uri_output_dir_)
// for (i=0; i<output_dir_list.length; i++) {
//     let name = output_dir_list[i]
//     let parts = name.split("__")
//     let ending = parts[parts.length - 1]
//     if (ending == "exp.txt") {
//         fs.unlinkSync(uri_output_dir_ + name)
//     }
// }

// Cleaning Checkpoint Dir
if (fs.existsSync(ckpt_dir_ + "ret_list.json"))
    fs.unlinkSync(ckpt_dir_ + "ret_list.json")
if (fs.existsSync(ckpt_dir_ + "del_list.json"))
    fs.unlinkSync(ckpt_dir_ + "del_list.json")
if (fs.existsSync(ckpt_dir_ + "url_visited.txt"))
    fs.unlinkSync(ckpt_dir_ + "url_visited.txt")