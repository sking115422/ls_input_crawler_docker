////// LIBRARY IMPORTS

const puppeteer = require('puppeteer')
const fs = require('fs');
const moment = require('moment')
// const config = require('config');
const YAML = require('yaml')
// const imageHash = require('image-hash');
// const blockhash = require("blockhash-core");
// const { createImageData } = require("canvas");
const imageHash = require('node-image-hash');
const { exit } = require('process');

////// SETTING VARIABLES FROM CONFIG

const config_path = "./config/default.yaml"
let conf_f = fs.readFileSync(config_path, 'utf8')
let conf_fy = YAML.parse(conf_f)

const paths = conf_fy.paths

let ac_wl_fp = paths.adult_content_word_list
let lsw_wl_fp = paths.lang_stop_word_list
let uri_input_path_ = paths.uri_input_path
let uri_output_dir_ = paths.uri_output_dir
let ckpt_dir_ = paths.ckpt_dir

const pupp_conf = conf_fy.puppeteer_config

let wait_until = pupp_conf.wait_until
let headless_ = pupp_conf.headless
let page_load_time_out = pupp_conf.page_load_time_out

const lang_check_conf = conf_fy.lang_check_config

let wp_desired_lang_ = lang_check_conf.wp_desired_lang
let wp_lang_thresh_ = lang_check_conf.wp_lang_thresh

const wp_exp_conf = conf_fy.wp_exp_conf

let max_clicks_ = wp_exp_conf.max_clicks
let click_timeout_ = wp_exp_conf.click_timeout
let max_num_bad_clicks_ = wp_exp_conf.max_num_bad_clicks
let depth_ = wp_exp_conf.depth
let start_from_ckpt_ = wp_exp_conf.start_from_ckpt
let num_prog_retry_ = wp_exp_conf.num_prog_retry
let vh = wp_exp_conf.view_height
let vw = wp_exp_conf.view_width

const ss_dup_rem = conf_fy.ss_dup_rem

let ss_dup_thold = ss_dup_rem.thold

////// CREATING CHECKPOINT FILES

if (!fs.existsSync(ckpt_dir_ + "ret_list.json")) {
    fs.writeFileSync(ckpt_dir_ + "ret_list.json", "[]")
}

if (!fs.existsSync(ckpt_dir_ + "del_list.json")) {
    fs.writeFileSync(ckpt_dir_ + "del_list.json", "[]")
}

if (!fs.existsSync(ckpt_dir_ + "url_visited.txt")) {
    fs.writeFileSync(ckpt_dir_ + "url_visited.txt", "")
}

////// READING IN FILES

// Reading in stop words
f = fs.readFileSync(lsw_wl_fp, {encoding: 'utf8', flag: "r"})
sw_list = f.split("\r\n")

// Reading in adult content related words
f2 = fs.readFileSync(ac_wl_fp, {encoding: 'utf8', flag: "r"})
ac_list = f2.split("\n")

////// HELPER FUNCTIONS

// Sleep function implemetation
function sleep(ms) {
    let start = new Date().getTime()
    let expire = start + ms;
    while (new Date().getTime() < expire) { }
    return;
}

// Function generates a list of urls specified in a text file for processing
function getUrlsFromTextFile (path) {

    const urls = []

    try {
        const tmp = fs.readFileSync(path, 'utf8')
        tmp.split(/\r?\n/).forEach(line => {
            urls.push(line)
        })
    } catch (err) {
        console.error(err)
    }

    return urls
}

// Function removes duplicates from an arrau
function removeDups(lst) {
    return [...new Set(lst)]
}

// Function performs set difference then returns array of difference
function setDiff(l1, l2) {
    let s1 = new Set(l1)
    let s2 = new Set(l2)
    return Array.from(new Set([...s1].filter(x => !s2.has(x))));
}

// Randomize array in-place using Durstenfeld shuffle algorithm
function shuffleArr(array) {
    let arrayCopy = [...array]
    for (var i = arrayCopy.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = arrayCopy[i];
        arrayCopy[i] = arrayCopy[j];
        arrayCopy[j] = temp;
    }
    return arrayCopy
}

// Function returns a randomized sub array from an array
function getRandomSubArrFromArr(arr, num) {
    let ind_arr = Array.from({ length: arr.length }, (value, index) => index)
    if (num > arr.length) {
        num = arr.length
    }
    let ind_arr_shuffle_choose = shuffleArr(ind_arr).slice(0, num)
    let ret_arr = []
    for (i=0; i<ind_arr_shuffle_choose.length; i++) {
        ret_arr.push(arr[ind_arr_shuffle_choose[i]])
    }
    return ret_arr
}

// Function removes an item from a given array
function removeItemFromArray(arr, item) {
    arr_tmp = [...arr]
    const index_ = arr_tmp.indexOf(item);
    if (index_ > -1) { // only splice array when item is found
      arr_tmp.splice(index_, 1); // 2nd parameter means remove one item only
    }
    return arr_tmp
}

function getPHash(imageBuffer) {
    
    res = imageHash
    .hash(imageBuffer, 8, 'hex')
    .then((hash) => {
        return hash.hash
    });
    return res

}

function hammingDistance(hash1, hash2) {

    if (hash1.length !== hash2.length) {
        throw new Error('Hashes must have the same length for comparison.');
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) {
        distance++;
        }
    }

    return distance;

}
  
function similarityScore(hash1, hash2) {

    const hashLength = hash1.length;
    const distance = hammingDistance(hash1, hash2);

    // Calculate the similarity score as a percentage
    const score = ((hashLength - distance) / hashLength) * 100;
    return score;

}

function getSimilarHashIndList(hashList, threshold) {

    const indicesToRemove = [];

    for (let i = 0; i < hashList.length; i++) {
        for (let j = i + 1; j < hashList.length; j++) {
        const hash1 = hashList[i];
        const hash2 = hashList[j];

        const score = similarityScore(hash1, hash2);

        if (score >= threshold) {
            indicesToRemove.push(j);
        }
        }
    }

    return indicesToRemove

} 

////// MAIN FUNCTIONS

// Function updates initial seed url list in case the previous run fails
function getUpdatedSeedList (dir, og_seed_list) {
    try{
        let visited_url_list = fs.readFileSync(dir + "url_visited.txt", "utf8").split("\r\n")
        start_ind = visited_url_list.length - 1
        let updated_list = []
        for(i=start_ind; i<og_seed_list.length; i++){
            updated_list.push(og_seed_list[i])
        }
        return updated_list
    } catch (e) {
        console.log(e)
    }
}

// Function creates checkpoint entries for each seed url if completed successfully
function createCkptJson(dir, ind, url, ret_list, del_list) {

        if (fs.existsSync(dir + "ret_list.json")) {
            let ret_list_json = JSON.parse(fs.readFileSync(dir + "ret_list.json"))
            ret_list_json.push(ret_list)
            fs.writeFileSync(dir + "ret_list.json", JSON.stringify(ret_list_json))
        }

        if (fs.existsSync(dir + "del_list.json")) {
            let del_list_json = JSON.parse(fs.readFileSync(dir + "del_list.json"))
            del_list_json.push(del_list)
            fs.writeFileSync(dir + "del_list.json", JSON.stringify(del_list_json))
        }

        if (fs.existsSync(dir + "url_visited.txt")) {
            fs.appendFileSync(dir + "url_visited.txt", ind + " " + url + "\r\n")
        }


}

async function removeDuplicateSites(uri_list) {

    hash_list = []

    for (let i = 0; i < uri_list.length; i++) {

        let uri = uri_list[i]
        let browser
        let page

        try {

            browser = await puppeteer.launch({ headless: headless_, ignoreHTTPSErrors: true, args: ['--no-sandbox'] })
            page = await browser.newPage()

            // Close the initial page opened by Puppeteer to avoid the bug
            const pages = await browser.pages()
            if (pages.length > 1) {
                await pages[0].close()
            }

            await page.setViewport({
                height: vh,
                width: vw
            });

            await page.goto(uri, {
                waitUntil: wait_until,
                timeout: page_load_time_out * 1000,
            });

            let ss = await page.screenshot({clip: {
                x:0,
                y:0,
                width: vw,
                height: vh
            }})
            
            hash_list.push(await getPHash(ss))
  
        } catch (e) {

            // console.error(e)
            hash_list.push("0000000000000000")

        } finally {

            if (page) {
                await page.close()
            }
            if (browser) {
                await browser.close()
            }

        }

    }

    

    let ind_rem_list = removeDups(getSimilarHashIndList(hash_list, ss_dup_thold))
    console.log("indecies removed:", ind_rem_list)

    // Sort the indices in descending order to avoid issues when removing elements
    ind_rem_list.sort((a, b) => b - a)

    // Remove elements at the specified index positions
    ind_rem_list.forEach(index => {
        uri_list.splice(index, 1);
    });

    return uri_list

}

// Function checks if a webpage is in a particular language and throws an error if it is not
async function checkWebpageLang(sw_list, page, wp_desired_lang, wp_lang_thresh) {
    try {
        // Setting language word percent to zero
        let lang_w_per = 0

        // Checking to see if the webpage has the specified language
        const wp_raw_lang = await page.$eval('html', (element) => element.lang)

        // If the language matches the desired language, set percent to 1
        if (wp_raw_lang == wp_desired_lang) {
            lang_w_per = 1
        }

        // If not, we will check the inner text of all elements on the page against common stopwords of the language
        // then we will recompute lang_w_per
        if (lang_w_per < wp_lang_thresh) {
            let en_count = 0
            let word_count = 0

            const element_list_text = await page.$$eval('*', (elements) =>
                elements.map((element) => element.innerText)
            )

            for (let i = 0; i < element_list_text.length; i++) {
                if (element_list_text[i] != null) {
                    const elemWords = element_list_text[i].split(" ");
                    for (let j = 0; j < elemWords.length; j++) {
                        word_count++;
                        for (let k = 0; k < sw_list.length; k++) {
                            if (elemWords[j] == sw_list[k]) {
                                en_count++;
                            }
                        }
                    }
                }
            }

            lang_w_per = en_count / word_count
        }

        // If language percent too low, throw an error
        if (lang_w_per < wp_lang_thresh) {
            throw new Error("This webpage is not in English, so it will be skipped!")
        }
    } catch (error) {
        // Handle the error here or rethrow it if needed
        throw error;
    }
}

// Function clicks all elements on a give page. 
async function clickAllElements(page, element_list, max_clicks, click_timeout, max_num_bad_clicks) {

    let uri_list_tmp = []
    let bad_click_ctr = 0

    // Set max number of element to be click on. If max entire array will be randomized and returned. This yeilds better perfomance overall.
    if (max_clicks = "max" || max_clicks > element_list.length) {
        element_list = getRandomSubArrFromArr(element_list, element_list.length)
    } else {
        element_list = getRandomSubArrFromArr(element_list, max_clicks)
    }

    // Iterate through each element
    for (i = 0; i < element_list.length; i++) {
        
        // If bad clicks exceeds threshold, break out of loop
        if (bad_click_ctr > max_num_bad_clicks - 1){
            break                        
        }

        try {

            let elem = element_list[i]

            // Use a Promise-based timeout mechanism
            await new Promise((resolve, reject) => {

                const timeoutID = setTimeout(() => {
                    clearTimeout(timeoutID) // Clear the timeout
                    console.log(bad_click_ctr + 1 + ". click has taken too long to load... it will be skipped!")
                    reject()
                    bad_click_ctr++                               
                }, click_timeout)

                elem.click()
                    .then(() => {
                        clearTimeout(timeoutID) // Clear the timeout
                        resolve()
                    })
                    .catch((error) => {
                        clearTimeout(timeoutID) // Clear the timeout
                        reject(error)
                    })

            })

            uri_list_tmp.push(page.url())

        } catch (e) {
            // console.error(e)
        }

    }

    return uri_list_tmp

}

async function exploreUri(uri_list) {

    let uri_list_uniq_master = [];
    let del_list_uniq_master = [];

    for (let i = 0; i < uri_list.length; i++) {

        let uri = uri_list[i]
        let browser
        let page

        try {


            // // For use outside of docker container on bare metal machine
            // browser = await puppeteer.launch({ headless: headless_, ignoreHTTPSErrors: true})

            // For use in docker container
            browser = await puppeteer.launch({ 
                headless: headless_, 
                ignoreHTTPSErrors: true, 
                args: 
                [
                    '--no-sandbox'
                    // '--disable-setuid-sandbox'
                ] 
            })

            page = await browser.newPage()

            // Close the initial page opened by Puppeteer to avoid the bug
            const pages = await browser.pages()
            if (pages.length > 1) {
                await pages[0].close()
            }

            await page.setViewport({
                height: vh,
                width: vw
            });

            await page.goto(uri, {
                waitUntil: wait_until,
                timeout: page_load_time_out * 1000,
            });

            let ss = await page.screenshot({clip: {
                x:0,
                y:0,
                width: vw,
                height: vh
            }})

            // console.log(await getPHash(ss))

            const element_list = await page.$$('*')

            await checkWebpageLang(sw_list, page, wp_desired_lang_, wp_lang_thresh_)
            let uri_list = await clickAllElements(page, element_list, max_clicks_, click_timeout_ * 1000, max_num_bad_clicks_)
            let tab_list = await browser.pages()

            for (let j = 0; j < tab_list.length; j++) {
                uri_list.push(tab_list[j].url())
            }

            uri_list_uniq_master = removeDups([...uri_list_uniq_master, ...uri_list])

        } catch (e) {

            del_list = [uri, ...uri_list]
            del_list_uniq_master = removeDups([...del_list, ...del_list_uniq_master])
            console.error(e)

        } finally {

            if (page) {
                await page.close()
            }
            if (browser) {
                await browser.close()
            }

        }

    }

    return [uri_list_uniq_master, del_list_uniq_master]

}

async function exploreUriToDepth (uri, depth) {

    let ind = 0
    let uri_list = [uri]
    let uri_list_master = [uri]
    let del_list_master = []

    while (ind < depth) {
        try {

            let res = await exploreUri(uri_list)
            let uri_list_new = res[0]
            let diff_list = setDiff(uri_list_new, uri_list)

            uri_list_master.push(diff_list)
            uri_list = diff_list

            let del_list = res[1]
            if (del_list.length > 0) {
                del_list_master.push(...del_list)
            }

        } catch (e) {
            console.log(e)
        } finally {
            console.log(ind)
            ind++            
        }
    }

    return [uri_list_master, del_list_master]

}

async function exploreUriListToDepth (uri_list, depth) {

    let ret_list = []
    let del_list = []
    
    ind = 0
    while (ind < uri_list.length) {
        console.log(uri_list[ind])
        try {
            tmp_list = await exploreUriToDepth(uri_list[ind], depth)
            ret_list.push(tmp_list[0])
            del_list.push(tmp_list[1])
            createCkptJson(ckpt_dir_, ind, uri_list[ind], ret_list, del_list)
        } catch (e) {
            console.log(e)
        } finally {
            ind++
        }
    }

    return [ret_list, del_list]

}

////// MAIN DRIVER

async function mainDriver () {

    let retry_ind = 0

    while (retry_ind < num_prog_retry_) {

        console.log("STARTING URI EXPLORATION")

        try{

            let uri_seed_list = getUrlsFromTextFile(uri_input_path_)

            if (start_from_ckpt_) {
            uri_seed_list = getUpdatedSeedList(ckpt_dir_, uri_seed_list)
            //    console.log(uri_seed_list)
            }

            tmp_list = await exploreUriListToDepth(uri_seed_list, depth_)
            uri_list_master = tmp_list[0]
            uri_del_list_master = tmp_list[1]

            const timestamp = new Date().getTime()
            ts_f = moment(timestamp).format()

            if (!fs.existsSync("./logs/" + ts_f))
                fs.mkdirSync("./logs/" + ts_f)

            fs.writeFileSync("./logs/" + ts_f + "/uri_list_master.json", JSON.stringify(uri_list_master))

            for (i = 0; i < uri_seed_list.length; i++) {
                if (i != uri_seed_list.length - 1)
                    fs.appendFileSync("./logs/" + ts_f + "/uri_seed_list.txt", uri_seed_list[i] + "\r\n", )
                else 
                fs.appendFileSync("./logs/" + ts_f + "/uri_seed_list.txt", uri_seed_list[i], )
            }

            uri_list_master_flat = removeDups(uri_list_master.flat(2))
            uri_del_list_master_flat = removeDups(uri_del_list_master.flat(2))

            if (start_from_ckpt_) {

                ckpt_ret_obj = JSON.parse(fs.readFileSync(ckpt_dir_ + "ret_list.json"))
                ckpt_ret_list = removeDups(ckpt_ret_obj.flat(3))
                uri_list_master_flat = [...ckpt_ret_list, ...uri_list_master_flat]

                ckpt_del_obj = JSON.parse(fs.readFileSync(ckpt_dir_ + "del_list.json"))
                ckpt_del_list = removeDups(ckpt_del_obj.flat(2))
                uri_del_list_master_flat = [...ckpt_del_list, ...uri_del_list_master_flat]

            }

            let uri_list_master_flat_cln = uri_list_master_flat
            for (i=0; i<uri_del_list_master_flat.length; i++) {
                uri_list_master_flat_cln = removeItemFromArray(uri_list_master_flat_cln, uri_del_list_master_flat[i])
            }

            del_list_ac = []
            for (i=0; i<uri_list_master_flat_cln.length; i++){
                for (j=0; j<ac_list.length; j++){
                    // console.log(uri_list_master_flat_cln[i],  ac_list[j], uri_list_master_flat_cln[i].indexOf(ac_list[j]))
                    if (uri_list_master_flat_cln[i].indexOf(ac_list[j]) >= 0) {
                        // console.log(uri_list_master_flat_cln[i],  ac_list[j], uri_list_master_flat_cln[i].indexOf(ac_list[j]))
                        del_list_ac.push(uri_list_master_flat_cln[i])
                    }
                }
            }

            for (i=0; i<del_list_ac.length; i++) {
                uri_list_master_flat_cln = removeItemFromArray(uri_list_master_flat_cln, del_list_ac[i])
            }

            let uri_out_path = ""
            let uri_out_path_list1 = uri_input_path_.split("/")
            let uri_out_path_list2 = uri_out_path_list1[uri_out_path_list1.length - 1].split(".")

            if (uri_output_dir_ == "default") {
                uri_out_path = uri_out_path_list1.slice(0, uri_out_path_list1.length - 1).join("/") + "/" + uri_out_path_list2[0] + "__exp.txt"
            } else {
                uri_out_path = uri_output_dir_ + uri_out_path_list2[0] + "__exp.txt"
            }

            console.log("STARTING DUPLICATE SITE REMOVAL")
            console.log("original uri_list:", uri_list_master_flat_cln.length)

            uri_list_master_flat_cln = await removeDuplicateSites(uri_list_master_flat_cln)

            console.log("dup removed uri_list:", uri_list_master_flat_cln.length)

            if (uri_list_master_flat_cln && uri_list_master_flat_cln.length > 0) {
                for (let i = 0; i < uri_list_master_flat_cln.length; i++) {
                    if (i !== uri_list_master_flat_cln.length - 1) {
                        fs.appendFileSync(uri_out_path, uri_list_master_flat_cln[i] + "\r\n");
                    } else {
                        fs.appendFileSync(uri_out_path, uri_list_master_flat_cln[i]);
                    }
                }
            } else {
                // If the list is empty, create an empty file
                fs.writeFileSync(uri_out_path, "");
            }

            exit(0)

        } catch (e) {
            console.log(e)
        } finally {
            retry_ind++

        }

    }

}

mainDriver()
