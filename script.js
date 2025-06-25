const map = L.map('map').setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const timelineItems = new vis.DataSet();
const timeline = new vis.Timeline(document.getElementById('timeline'), timelineItems, {
  selectable: true,
  zoomKey: 'ctrlKey'
});

const markers = {};
let markerMeta = {};
let intervalId = null;
let sheetId = '';

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('sheetURL');
  if (saved) {
    document.getElementById('sheet-url').value = saved;
    sheetId = extractSheetId(saved);
    if (sheetId) fetchAndRenderData();
  }
});

document.getElementById('load').onclick = () => {
  const url = document.getElementById('sheet-url').value.trim();
  localStorage.setItem('sheetURL', url);
  sheetId = extractSheetId(url);
  if (!sheetId) return alert('Invalid Google Sheet URL or ID.');
  fetchAndRenderData();
};

document.getElementById('auto-refresh').addEventListener('change', function () {
  if (this.checked) {
    intervalId = setInterval(fetchAndRenderData, 30000);
  } else {
    clearInterval(intervalId);
  }
});

timeline.on('rangechanged', function (props) {
  const center = new Date((props.start.getTime() + props.end.getTime()) / 2);
  filterMarkersByDate(center);
});

function extractSheetId(input) {
  const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/) || input.match(/^([a-zA-Z0-9-_]{30,})$/);
  return match ? match[1] : null;
}

async function fetchAndRenderData() {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=0`;
  try {
    const resp = await fetch(sheetUrl);
    const text = await resp.text();
    const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\((.*)\)/)[1]);
    const rows = json.table.rows;

    clearAll();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const row = {
        id: i,
        name: r.c[0]?.v,
        loc: r.c[1]?.v,
        from: r.c[2]?.f || r.c[2]?.v || '',
        to: r.c[3]?.f || r.c[3]?.v || ''
      };
      if (row.name && row.loc) renderRow(row);
    }

    zoomToAll();

  } catch (e) {
    alert("Failed to fetch or parse sheet. Make sure it is published and publicly viewable.");
    console.error(e);
  }
}

function clearAll() {
  document.querySelector('#log-table tbody').innerHTML = '';
  timelineItems.clear();
  Object.values(markers).forEach(m => map.removeLayer(m));
  Object.keys(markers).forEach(k => delete markers[k]);
  markerMeta = {};
}

function renderRow(row) {
  const tbody = document.querySelector('#log-table tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${row.name}</td><td>${row.loc}</td><td>${row.from}</td><td>${row.to}</td>`;
  tr.style.cursor = 'pointer';
  tr.addEventListener('click', () => zoomToRow(row.id));
  tbody.appendChild(tr);

  const color = randomColor();
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(row.loc)}`)
    .then(r => r.json())
    .then(arr => {
      if (!arr.length) return;
      const geo = arr[0];
      const bounds = [[+geo.boundingbox[0], +geo.boundingbox[2]], [+geo.boundingbox[1], +geo.boundingbox[3]]];
      const rect = L.rectangle(bounds, {
        color: color,
        weight: 2,
        fillOpacity: 0.35
      }).addTo(map);
      markers[row.id] = rect;
      markerMeta[row.id] = { bounds, from: row.from, to: row.to };

      timelineItems.add({
        id: row.id,
        content: row.name,
        start: row.from || row.to,
        end: row.to || row.from
      });
    });
}

function zoomToAll() {
  const group = L.featureGroup(Object.values(markers));
  if (group.getBounds().isValid()) {
    map.fitBounds(group.getBounds().pad(0.2));
  }
}

function zoomToRow(id) {
  const marker = markers[id];
  if (marker) {
    map.fitBounds(marker.getBounds().pad(0.2));
    marker.setStyle({ weight: 4 });
    setTimeout(() => marker.setStyle({ weight: 2 }), 800);
  }
}

function filterMarkersByDate(centerDate) {
  Object.entries(markerMeta).forEach(([id, meta]) => {
    const marker = markers[id];
    const from = new Date(meta.from);
    const to = new Date(meta.to || meta.from);
    const isActive = (!isNaN(from) && !isNaN(to) && centerDate >= from && centerDate <= to);
    if (marker) {
      if (isActive) {
        marker.addTo(map);
      } else {
        map.removeLayer(marker);
      }
    }
  });
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 50%)`;
}
