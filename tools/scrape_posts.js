/**
 * 抖音博主作品数据抓取（一次性）
 *
 * 用法：
 *   cd tools
 *   npm install puppeteer
 *   node scrape_posts.js "https://v.douyin.com/tjijJq5Aew4/"
 */
const puppeteer = require('puppeteer');

const shareUrl = process.argv[2];
if (!shareUrl) {
  console.log('用法: node scrape_posts.js <抖音分享链接>');
  console.log('例如: node scrape_posts.js "https://v.douyin.com/xxxxx/"');
  process.exit(1);
}

(async () => {
  console.log('启动浏览器...');
  // 优先用本地已安装的 Chrome，没有的话 puppeteer 会自动下载
  const fs = require('fs');
  const chromePaths = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
  ].filter(p => { try { return fs.existsSync(p); } catch { return false; } });

  const browser = await puppeteer.launch({
    headless: 'new',
    ...(chromePaths.length > 0 ? { executablePath: chromePaths[0] } : {}),
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  const awemeData = [];

  // 拦截 API 响应，捕获作品列表
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('aweme/v1/web/aweme/post') || url.includes('aweme/post')) {
      try {
        const json = await resp.json();
        const list = json.aweme_list || [];
        console.log(`  → 捕获 ${list.length} 个作品`);
        for (const a of list) {
          awemeData.push({
            desc: a.desc || '',
            date: new Date(a.create_time * 1000).toISOString().split('T')[0],
            play: a.statistics?.play_count || 0,
            digg: a.statistics?.digg_count || 0,
            comment: a.statistics?.comment_count || 0,
            collect: a.statistics?.collect_count || 0,
            share: a.statistics?.share_count || 0,
          });
        }
      } catch {}
    }
  });

  // 先解析短链接，拿到真实用户主页 URL
  console.log('解析短链接...');
  await page.goto(shareUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));
  const finalUrl = page.url();

  // 提取 sec_uid 构造主页地址
  const secMatch = finalUrl.match(/sec_uid=([A-Za-z0-9_-]+)/) || finalUrl.match(/\/user\/([A-Za-z0-9_-]+)/);
  if (!secMatch) {
    console.log('无法解析用户 ID，最终 URL: ' + finalUrl);
    await browser.close();
    process.exit(1);
  }

  const secUid = secMatch[1];
  const profileUrl = `https://www.douyin.com/user/${secUid}`;
  console.log('用户ID: ' + secUid.substring(0, 20) + '...');
  console.log('访问主页: ' + profileUrl);

  // 访问用户主页
  await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 5000));

  // 滚动加载更多作品
  const targetYear = new Date().getFullYear().toString();
  let lastCount = 0;
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 1500));

    const thisYear = awemeData.filter((a) => a.date.startsWith(targetYear));
    if (thisYear.length > lastCount) {
      lastCount = thisYear.length;
      console.log(`  已加载 ${targetYear} 年作品: ${lastCount} 个`);
    }

    // 如果已经有今年作品且连续 5 次没新增，停止
    if (lastCount > 0 && thisYear.length === lastCount && i > lastCount + 3) {
      break;
    }
  }

  await browser.close();

  // 输出结果
  const result = awemeData.filter((a) => a.date.startsWith(targetYear));

  console.log('\n' + '='.repeat(60));
  console.log(`${targetYear} 年作品统计 (${result.length} 个)`);
  console.log('='.repeat(60));

  let tp = 0, tl = 0, tc = 0, tcol = 0, ts = 0;
  for (const a of result) {
    console.log(`[${a.date}] ${a.desc.substring(0, 60)}`);
    console.log(
      `  播放:${a.play.toLocaleString()}  点赞:${a.digg.toLocaleString()}  评论:${a.comment.toLocaleString()}  收藏:${a.collect.toLocaleString()}  分享:${a.share.toLocaleString()}`
    );
    tp += a.play;
    tl += a.digg;
    tc += a.comment;
    tcol += a.collect;
    ts += a.share;
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`${targetYear} 年总计:`);
  console.log(`  播放量: ${tp.toLocaleString()}`);
  console.log(`  点赞:   ${tl.toLocaleString()}`);
  console.log(`  评论:   ${tc.toLocaleString()}`);
  console.log(`  收藏:   ${tcol.toLocaleString()}`);
  console.log(`  分享:   ${ts.toLocaleString()}`);
  console.log('-'.repeat(60));
})();
