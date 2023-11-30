async function get_ss (ind, uri) {

    try {

        const browser = await puppeteer.launch({headless:'new'})
        const page = await browser.newPage(); //open new tab
        await (await browser.pages())[0].close(); //close first one, to overcome the bug in stealth library mentioned in
        //https://github.com/berstend/puppeteer-extra/issues/88

        await page.setViewport({
            height: 1080,
            width: 1920
        });

        await page.goto(uri, {
            //https://blog.cloudlayer.io/puppeteer-waituntil-options/
            waitUntil: "networkidle2",
            timeout: 3 * 1000
            // timeout: 0
        })

        await sleep(1000)

        const t_hold = .35

        let eng_w_per = 0

        let wp_lang = await page.evaluate(() => {
            const lang = document.querySelector('html').lang
            return lang
        })

        if (wp_lang = "en") {
            eng_w_per = 1
        }

        if (eng_w_per < t_hold) {
            
            allElements = await page.evaluate(() => {
                const tmp_list = []
                const allElements = document.querySelectorAll('*')
                for (const element of allElements) {
                    tmp_list.push(element.innerText)
                }             
                return tmp_list
            })

            en_count = 0
            word_count = 0

            for (let i = 0; i < allElements.length; i++) {
                elemWords = allElements[i].split(" ")
                bf = false
                for (let j = 0; j < elemWords.length; j++) {
                    word_count++
                    for (k = 0; k < sw_list.length; k++){
                        if (elemWords[j] == sw_list[k]) {
                            en_count ++
                        }
                    } 
                }
            }

            eng_w_per = en_count/word_count
        }

        if (eng_w_per < t_hold) {
            throw {name: "nonEnglishWebpageException", message: "This webpage is not in english so it will be skipped!"};
        }

        await sleep(2000)

        await page.screenshot({
            path: `./ss/ss_${ind}.png`,
            clip: {
                x:0,
                y:0,
                width: 1920,
                height: 1080
            }
        })

        await page.close()
        await browser.close()       

    } catch (e) {

        console.error(e)
        await page.close()
        await browser.close()

    } 

}
