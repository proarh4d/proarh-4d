/* Proarh.4d — magazin (proarh4d.com)
 * Citește produsele active din catalogul comun cu proarh4d.ro și le afișează.
 * Cumpărarea / descărcarea se face pe proarh4d.ro, unde există cont și plată.
 */
(function () {
  'use strict'

  var CFG = window.SHOP_CONFIG
  // Doar coloanele necesare afișării — niciodată linkul fișierului.
  var COLUMNS = 'id,nume,descriere,descriere_scurta,pret,pret_vechi,categorie,tags,imagine_url,imagini,featured,created_at'

  function el(tag, attrs, children) {
    var node = document.createElement(tag)
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k]
      else if (k === 'class') node.className = attrs[k]
      else node.setAttribute(k, attrs[k])
    })
    ;(children || []).forEach(function (c) { if (c) node.appendChild(c) })
    return node
  }

  function api(query) {
    return fetch(CFG.supabaseUrl + '/rest/v1/products?' + query, {
      headers: { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey },
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    })
  }

  function isFree(p) { return !(Number(p.pret) > 0) }
  function money(v) { return Number(v).toFixed(2) + ' lei' }

  function priceNode(p) {
    var node = el('span', { class: 'price', text: isFree(p) ? 'Free' : money(p.pret) })
    if (!isFree(p) && Number(p.pret_vechi) > Number(p.pret)) {
      node.appendChild(el('s', { text: money(p.pret_vechi) }))
    }
    return node
  }

  function buyUrl(p) { return CFG.mainSite + '/shop/' + encodeURIComponent(p.id) }

  function normalize(text) {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[șş]/g, 's')
      .replace(/[țţ]/g, 't')
      .trim()
  }

  function showState(root, title, detail, boxed) {
    root.replaceChildren(
      el('div', { class: 'state' + (boxed ? ' box' : '') }, [
        document.createTextNode(title),
        detail ? el('small', { text: detail }) : null,
      ])
    )
  }

  function showError(root) {
    var link = el('a', { href: CFG.mainSite + '/shop', text: 'proarh4d.ro/shop' })
    var small = el('small', {}, [document.createTextNode('Please try again in a moment, or open '), link, document.createTextNode('.')])
    root.replaceChildren(el('div', { class: 'state box' }, [document.createTextNode('The catalog could not be loaded'), small]))
  }

  /* ── Catalog ────────────────────────────────────────── */
  function initCatalog(root) {
    var input = document.getElementById('search')
    var clear = document.getElementById('clear')
    var chips = document.getElementById('chips')
    var products = []
    var category = ''

    function card(p) {
      var thumb = el('div', { class: 'thumb' })
      if (p.imagine_url) thumb.appendChild(el('img', { src: p.imagine_url, alt: '', loading: 'lazy' }))
      else thumb.textContent = 'No image available'

      return el('a', { class: 'card', href: 'product.html?id=' + encodeURIComponent(p.id) }, [
        isFree(p) ? el('span', { class: 'badge free', text: 'Free' }) : p.featured ? el('span', { class: 'badge', text: 'Featured' }) : null,
        thumb,
        el('div', { class: 'card-body' }, [
          el('span', { class: 'cat', text: p.categorie || 'Digital' }),
          el('h2', { text: p.nume }),
          el('p', { text: p.descriere_scurta || p.descriere || '' }),
          el('div', { class: 'card-foot' }, [priceNode(p), el('span', { class: 'btn', text: 'Details' })]),
        ]),
      ])
    }

    function render() {
      var terms = normalize(input.value).split(/\s+/).filter(Boolean)
      clear.hidden = !input.value
      var list = products.filter(function (p) {
        if (category && (p.categorie || 'Digital') !== category) return false
        var hay = normalize([p.nume, p.categorie, p.descriere_scurta, p.descriere, (p.tags || []).join(' ')].join(' '))
        return terms.every(function (t) { return hay.indexOf(t) !== -1 })
      })
      if (!products.length) return showState(root, 'No products available at the moment.')
      if (!list.length) return showState(root, 'No results found', 'Nothing matches your search. Try another word or category.', true)
      root.replaceChildren(el('div', { class: 'grid' }, list.map(card)))
    }

    function renderChips() {
      var cats = []
      products.forEach(function (p) {
        var c = p.categorie || 'Digital'
        if (cats.indexOf(c) === -1) cats.push(c)
      })
      if (cats.length < 2) return
      ;[''].concat(cats.sort()).forEach(function (c) {
        var b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(c === category), text: c || 'All' })
        b.addEventListener('click', function () {
          category = c
          Array.prototype.forEach.call(chips.children, function (x) { x.setAttribute('aria-pressed', String(x === b)) })
          render()
        })
        chips.appendChild(b)
      })
    }

    input.addEventListener('input', render)
    clear.addEventListener('click', function () { input.value = ''; input.focus(); render() })

    api('activ=eq.true&select=' + COLUMNS + '&order=featured.desc,created_at.desc')
      .then(function (rows) { products = rows; renderChips(); render() })
      .catch(function () { showError(root) })
  }

  /* ── Product ────────────────────────────────────────── */
  // Descrierea e text simplu: titluri cu majuscule, rânduri cu „- ” și paragrafe.
  function describe(text) {
    var box = el('div', { class: 'desc' })
    var list = null
    ;(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim()
      if (!line) { list = null; return }
      var bullet = /^[-•–]\s+/.test(line)
      if (bullet) {
        if (!list) { list = el('ul'); box.appendChild(list) }
        list.appendChild(el('li', { text: line.replace(/^[-•–]\s+/, '') }))
        return
      }
      list = null
      var heading = line.length < 70 && line === line.toUpperCase() && /[A-Z]/.test(line)
      box.appendChild(el(heading ? 'h3' : 'p', { text: heading ? line.replace(/:$/, '') : line }))
    })
    return box
  }

  function initProduct(root) {
    var id = new URLSearchParams(location.search).get('id') || ''
    if (!/^[0-9a-f-]{20,}$/i.test(id)) return showState(root, 'Product not found', 'The link may be incomplete.', true)

    api('id=eq.' + encodeURIComponent(id) + '&activ=eq.true&select=' + COLUMNS + '&limit=1')
      .then(function (rows) {
        var p = rows[0]
        if (!p) return showState(root, 'Product not found', 'It may have been removed from the catalog.', true)
        document.title = p.nume + ' | Proarh.4d Shop'

        var images = (p.imagini && p.imagini.length ? p.imagini : [p.imagine_url]).filter(Boolean)
        var main = el('img', { src: images[0] || '', alt: p.nume })
        var stage = el('div', { class: 'stage' }, images.length ? [main] : [])
        if (!images.length) stage.textContent = 'No image available'
        var strip = el('div', { class: 'strip' })
        if (images.length > 1) {
          images.forEach(function (src, i) {
            var b = el('button', { type: 'button', 'aria-label': 'Image ' + (i + 1), 'aria-current': String(i === 0) }, [el('img', { src: src, alt: '', loading: 'lazy' })])
            b.addEventListener('click', function () {
              main.src = src
              Array.prototype.forEach.call(strip.children, function (x) { x.setAttribute('aria-current', String(x === b)) })
            })
            strip.appendChild(b)
          })
        }

        var free = isFree(p)
        var tags = el('div', { class: 'tags' }, (p.tags || []).slice(0, 24).map(function (t) { return el('span', { text: t }) }))

        root.replaceChildren(
          el('div', { class: 'product' }, [
            el('div', { class: 'gallery' }, [stage, images.length > 1 ? strip : null]),
            el('div', { class: 'info' }, [
              el('span', { class: 'eyebrow', text: p.categorie || 'Digital' }),
              el('h1', { text: p.nume }),
              p.descriere_scurta ? el('p', { class: 'lead', text: p.descriere_scurta }) : null,
              el('div', { class: 'buy' }, [
                priceNode(p),
                el('a', { class: 'btn', href: buyUrl(p), text: free ? 'Download free on proarh4d.ro' : 'Buy on proarh4d.ro' }),
                el('small', { text: 'You will continue on proarh4d.ro, where you sign in' + (free ? '' : ', pay securely') + ' and download the files from your account.' }),
              ]),
              describe(p.descriere),
              (p.tags || []).length ? tags : null,
            ]),
          ])
        )
      })
      .catch(function () { showError(root) })
  }

  document.addEventListener('DOMContentLoaded', function () {
    var year = document.getElementById('year')
    if (year) year.textContent = new Date().getFullYear()
    var catalog = document.getElementById('catalog')
    var product = document.getElementById('product')
    if (catalog) initCatalog(catalog)
    if (product) initProduct(product)
  })
})()
