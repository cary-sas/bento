// SPDX-License-Identifier: MIT
const $ = (id) => document.getElementById(id)
let config, current, pollTimer, loadedReport = false
const storage = { get: () => { try { return sessionStorage.getItem('bento-import-job') } catch { return null } },
  set: (value) => { try { value ? sessionStorage.setItem('bento-import-job', value) : sessionStorage.removeItem('bento-import-job') } catch {} } }
function say(text, bad = false) { $('status').textContent = text; $('status').className = bad ? 'error' : '' }
async function api(url, options = {}) {
  const r = await fetch(url, options), data = await r.json()
  if (!r.ok) { const e = new Error(data.error || r.statusText); e.status = r.status; throw e }
  return data
}
async function setup() {
  config = await api('/api/config')
  $('login').hidden = !config.authRequired || config.authenticated
  $('upload').hidden = !config.authenticated
  $('limits').textContent = `上传上限 / Limit: ${config.maxInputMb} MiB · 转换结束 ${config.retentionMinutes} 分钟后自动清理`
  if (config.authenticated && storage.get()) { current = storage.get(); $('upload').hidden = true; await poll() }
}
$('login').addEventListener('submit', async (e) => {
  e.preventDefault()
  try { await api('/api/session', { method: 'POST', body: $('password').value }); $('password').value = ''; say(''); await setup() }
  catch (err) { say(err.message, true) }
})
$('file').addEventListener('change', () => { const f = $('file').files[0]; $('selected').textContent = f ? `${f.name} · ${(f.size / 1048576).toFixed(1)} MiB` : '' })
$('upload').addEventListener('submit', (e) => {
  e.preventDefault()
  const f = $('file').files[0]
  if (!f) return
  if (f.size > config.maxInputMb * 1048576) return say('文件超过上传上限 / File exceeds upload limit', true)
  $('convert').disabled = true; $('progress').hidden = false; loadedReport = false
  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/jobs'); xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-File-Name', encodeURIComponent(f.name))
  xhr.upload.onprogress = (event) => { if (event.lengthComputable) { const n = Math.round(event.loaded / event.total * 100); $('progress').value = n; say(`正在上传 / Uploading: ${n}%`) } }
  const failed = (message) => { $('convert').disabled = false; $('progress').hidden = true; say(message, true) }
  xhr.onerror = () => failed('上传失败，请检查服务器连接后重试 / Upload failed')
  xhr.onload = () => {
    let data
    try { data = JSON.parse(xhr.responseText) } catch { return failed('上传失败 / Upload failed') }
    if (xhr.status !== 202) return failed(data.error || 'Upload failed')
    current = data.id; storage.set(current); $('upload').hidden = true; $('progress').hidden = true; say(''); poll()
  }
  xhr.send(f)
})
async function poll() {
  clearTimeout(pollTimer)
  try {
    const job = await api(`/api/jobs/${current}`)
    $('result').hidden = false; $('name').textContent = job.name
    $('state').textContent = ({ queued: '正在排队 / Queued', converting: '正在转换，大文件可能需要数分钟 / Converting…',
      done: '转换完成，请下载并检查报告 / Ready — review the report', failed: `转换失败 / Failed: ${job.error}` })[job.state] || job.state
    say('')
    const terminal = ['done', 'failed'].includes(job.state)
    $('delete').hidden = !terminal
    for (const [element, field] of [['download', 'download'], ['report', 'report']]) {
      $(element).hidden = !job[field]; if (job[field]) $(element).href = job[field]
    }
    $('expiry').textContent = job.expiresAt ? '文件到期时间 / Expires: ' + new Date(job.expiresAt).toLocaleString() : ''
    if (job.report && !loadedReport) {
      loadedReport = true; $('findings').hidden = false
      try { $('report-text').textContent = JSON.stringify(await api(job.report), null, 2) }
      catch { $('report-text').textContent = '报告预览加载失败，请使用下载链接 / Use the report download link' }
    }
    if (!terminal) pollTimer = setTimeout(poll, 1500)
  } catch (err) {
    if (err.status === 401) { $('result').hidden = true; $('login').hidden = false; say(err.message, true) }
    else if (err.status === 404) { storage.set(null); current = null; $('result').hidden = true; $('upload').hidden = false; $('convert').disabled = false; say(err.message, true) }
    else { say('连接暂时中断，正在重试 / Reconnecting…', true); pollTimer = setTimeout(poll, 3000) }
  }
}
$('delete').addEventListener('click', async () => {
  try {
    await api(`/api/jobs/${current}`, { method: 'DELETE' }); storage.set(null); current = null; loadedReport = false
    $('result').hidden = true; $('findings').hidden = true; $('upload').hidden = false; $('convert').disabled = false
    $('upload').reset(); $('selected').textContent = ''; say('文件已删除，可以转换下一个 PPT / Files deleted')
  } catch (err) { say(err.message, true) }
})
setup().catch((err) => say(err.message, true))
