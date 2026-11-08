// A classic browser script: Devjar serves it as-is, without bundling.
async function render() {
  const text = await (await fetch('data.csv')).text()
  const rows = text.trim().split('\n').slice(1).map(line => {
    const [week, signups] = line.split(',')
    return { week, signups: Number(signups) }
  })
  const max = Math.max(...rows.map(row => row.signups))
  document.getElementById('chart').innerHTML = rows.map(row => (
    `<div class="bar" style="height:${(row.signups / max) * 100}%" title="${row.week}"><span>${row.signups}</span></div>`
  )).join('')
  document.querySelector('#table tbody').innerHTML = rows.map(row => (
    `<tr><td>${row.week}</td><td>${row.signups}</td></tr>`
  )).join('')
}

render()
