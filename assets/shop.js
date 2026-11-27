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
  function discount(p) {
    if (isFree(p) || !(Number(p.pret_vechi) > Number(p.pret))) return 0
    return Math.round((1 - Number(p.pret) / Number(p.pret_vechi)) * 100)
  }

  function priceNode(p) {
    var node = el('span', { class: 'price' + (isFree(p) ? ' free' : ''), text: isFree(p) ? 'Free' : money(p.pret) })
    if (discount(p)) node.appendChild(el('s', { text: money(p.pret_vechi) }))
    return node
  }

  function buyUrl(p) { return CFG.mainSite + '/shop/' + encodeURIComponent(p.id) }
  function productUrl(p) { return 'product.html?id=' + encodeURIComponent(p.id) }
  function category(p) { return p.categorie || 'Digital' }

  // Numele din catalog are forma „Titlu / Revit Family (.rfa)”: pe carduri se arată doar titlul.
  function shortName(p) { return String(p.nume || '').split(' / ')[0].trim() }

  // Tipul fișierului și versiunea de Revit se citesc din textul produsului; ce nu se găsește nu se afișează.
  function kind(p) {
    var name = String(p.nume || '')
    var all = [p.nume, p.descriere_scurta, p.descriere].join(' ')
    if (/\.rvt\b|revit(\s+20\d\d)?\s+project/i.test(name)) return 'project'
    if (/\.rfa\b|revit\s+family/i.test(name)) return 'family'
    if (/\.rvt\b|revit(\s+20\d\d)?\s+project/i.test(all)) return 'project'
    if (/\.rfa\b|revit(\s+20\d\d)?\s+family/i.test(all)) return 'family'
    return ''
  }
  function kindLabel(k) { return k === 'project' ? 'Revit project (.rvt)' : k === 'family' ? 'Revit family (.rfa)' : '' }
  function revitVersion(p) {
    var m = /revit\s+(20\d\d)/i.exec([p.nume, p.descriere_scurta, p.descriere].join(' '))
    return m ? m[1] : ''
  }
  function images(p) { return (p.imagini && p.imagini.length ? p.imagini : [p.imagine_url]).filter(Boolean) }

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

  // Card de catalog: imagine mare, categorie, titlu, preț.
  function card(p) {
    var thumb = el('div', { class: 'thumb duo' })
    if (p.imagine_url) thumb.appendChild(el('img', { src: p.imagine_url, alt: '', loading: 'lazy' }))
    else { thumb.className = 'thumb'; thumb.textContent = 'No image available' }
    var off = discount(p)
    return el('a', { class: 'card', href: productUrl(p), 'aria-label': p.nume }, [
      isFree(p) ? el('span', { class: 'badge free', text: 'Free' }) : off ? el('span', { class: 'badge sale', text: '-' + off + '%' }) : null,
      thumb,
      el('div', { class: 'card-body' }, [
        el('span', { class: 'cat', text: category(p) + (kind(p) ? ' · ' + (kind(p) === 'project' ? 'Project' : 'Family') : '') }),
        el('h3', { text: shortName(p) }),
        el('div', { class: 'card-foot' }, [priceNode(p), el('span', { class: 'more', text: 'View →' })]),
      ]),
    ])
  }

  /* ── Prima pagină ───────────────────────────────────── */
  function initHome(root) {
    var input = document.getElementById('search')
    var clear = document.getElementById('clear')
    var tiles = document.getElementById('tiles')
    var title = document.getElementById('catalog-title')
    var products = []
    // filtru: '' | 'cat:Nume' | 'free' | 'project' | 'family'
    var filter = new URLSearchParams(location.search).get('filter') || ''
    var FILTERS = {
      '': { label: 'All products', test: function () { return true } },
      free: { label: 'Free downloads', test: isFree },
      project: { label: 'Revit projects', test: function (p) { return kind(p) === 'project' } },
      family: { label: 'Revit families', test: function (p) { return kind(p) === 'family' } },
    }
    function spec(key) {
      if (FILTERS[key]) return FILTERS[key]
      if (key.indexOf('cat:') === 0) {
        var c = key.slice(4)
        return { label: c, test: function (p) { return category(p) === c } }
      }
      return FILTERS['']
    }

    function render() {
      var terms = normalize(input.value).split(/\s+/).filter(Boolean)
      clear.hidden = !input.value
      var s = spec(filter)
      title.textContent = filter ? s.label : 'Catalog'
      var list = products.filter(function (p) {
        if (!s.test(p)) return false
        var hay = normalize([p.nume, p.categorie, p.descriere_scurta, p.descriere, (p.tags || []).join(' ')].join(' '))
        return terms.every(function (t) { return hay.indexOf(t) !== -1 })
      })
      if (!products.length) return showState(root, 'No products available at the moment.')
      if (!list.length) return showState(root, 'No results found', 'Nothing matches your search. Try another word or category.', true)
      root.replaceChildren(el('div', { class: 'grid' }, list.map(card)))
    }

    function renderTiles() {
      var keys = ['']
      products.forEach(function (p) {
        var k = 'cat:' + category(p)
        if (keys.indexOf(k) === -1) keys.push(k)
      })
      ;['project', 'family', 'free'].forEach(function (k) {
        if (products.some(FILTERS[k].test)) keys.push(k)
      })
      if (!spec(filter).test || keys.indexOf(filter) === -1) filter = ''
      var used = {} // fiecare categorie cu altă imagine, cât se poate
      tiles.replaceChildren.apply(tiles, keys.map(function (k) {
        var s = spec(k)
        var items = products.filter(s.test)
        var withImg = items.filter(function (p) { return p.imagine_url })
        var first = withImg.filter(function (p) { return !used[p.imagine_url] })[0] || withImg[0]
        if (first && k) used[first.imagine_url] = true
        var pic = first && k
          ? el('div', { class: 'pic duo' }, [el('img', { src: first.imagine_url, alt: '', loading: 'lazy' })])
          : el('div', { class: 'pic empty', text: String(items.length) })
        var b = el('button', { class: 'tile', type: 'button', 'aria-pressed': String(k === filter) }, [
          pic,
          el('span', { text: s.label }),
          el('small', { text: items.length + (items.length === 1 ? ' product' : ' products') }),
        ])
        b.addEventListener('click', function () {
          filter = k
          Array.prototype.forEach.call(tiles.children, function (x) { x.setAttribute('aria-pressed', String(x === b)) })
          render()
          document.getElementById('catalog-section').scrollIntoView()
        })
        return b
      }))
    }

    // Produsul vedetă: produsele marcate „featured”, cele cu mai multe imagini întâi; se schimbă din puncte.
    function renderHero() {
      var hero = document.getElementById('hero')
      var picks = products.filter(function (p) { return p.featured && p.imagine_url })
      if (!picks.length) picks = products.filter(function (p) { return p.imagine_url })
      picks = picks.slice().sort(function (a, b) { return images(b).length - images(a).length }).slice(0, 4)
      if (!picks.length) { hero.hidden = true; return }
      var current = 0
      var timer = null
      var wrap = el('div', { class: 'wrap' })
      hero.replaceChildren(wrap)

      function show(i) {
        current = i
        var p = picks[i]
        var dots = el('div', { class: 'dots' }, picks.length > 1 ? picks.map(function (x, j) {
          var d = el('button', { type: 'button', 'aria-label': 'Show ' + shortName(x), 'aria-current': String(j === i) })
          d.addEventListener('click', function () { stop(); show(j) })
          return d
        }) : [])
        var specs = el('dl', { class: 'specs' }, [
          kindLabel(kind(p)) ? el('div', {}, [el('dt', { text: 'File type' }), el('dd', { text: kindLabel(kind(p)) })]) : null,
          revitVersion(p) ? el('div', {}, [el('dt', { text: 'Revit' }), el('dd', { text: revitVersion(p) })]) : null,
          el('div', {}, [el('dt', { text: 'Images' }), el('dd', { text: String(images(p).length) })]),
        ])
        wrap.replaceChildren(
          el('div', { class: 'hero-grid' }, [
            el('div', { class: 'hero-text' }, [
              el('span', { class: 'eyebrow', text: 'Featured · ' + category(p) }),
              el('h1', { text: shortName(p) }),
              priceNode(p),
              el('span', { class: 'label', text: 'Description' }),
              el('p', { class: 'lead', text: p.descriere_scurta || '' }),
              dots,
            ]),
            el('a', { class: 'hero-media duo', href: productUrl(p), 'aria-label': p.nume }, [
              el('img', { src: p.imagine_url, alt: p.nume }),
            ]),
            el('div', { class: 'hero-side' }, [
              specs,
              el('a', { class: 'btn ghost', href: '#catalog-section', text: 'All products' }),
              el('a', { class: 'btn', href: productUrl(p), text: 'View product' }),
            ]),
          ])
        )
      }
      function stop() { if (timer) { clearInterval(timer); timer = null } }
      show(0)
      var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (picks.length > 1 && !calm) {
        timer = setInterval(function () { show((current + 1) % picks.length) }, 7000)
        hero.addEventListener('pointerenter', stop)
        hero.addEventListener('focusin', stop)
      }
    }

    function renderFree() {
      var free = products.filter(isFree)
      var band = document.getElementById('free-band')
      if (!free.length || !band) return
      document.getElementById('free-title').textContent = free.length + ' free Revit ' + (free.length === 1 ? 'file' : 'files')
      var box = document.getElementById('free-imgs')
      box.replaceChildren.apply(box, free.filter(function (p) { return p.imagine_url }).slice(0, 3).map(function (p) {
        return el('a', { href: productUrl(p), 'aria-label': p.nume }, [el('img', { src: p.imagine_url, alt: '', loading: 'lazy' })])
      }))
      document.getElementById('free-link').addEventListener('click', function (e) {
        e.preventDefault()
        filter = 'free'
        renderTiles()
        render()
        document.getElementById('catalog-section').scrollIntoView()
      })
      band.hidden = false
    }

    input.addEventListener('input', render)
    clear.addEventListener('click', function () { input.value = ''; input.focus(); render() })

    api('activ=eq.true&select=' + COLUMNS + '&order=featured.desc,created_at.desc')
      .then(function (rows) { products = rows; renderHero(); renderTiles(); renderFree(); render() })
      .catch(function () { document.getElementById('hero').hidden = true; showError(root) })
  }

  /* ── Fișa de produs ─────────────────────────────────── */
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
      var upper = line.length < 70 && line === line.toUpperCase() && /[A-Z]/.test(line)
      var labelled = line.length < 60 && /:$/.test(line)
      var heading = upper || labelled
      box.appendChild(el(heading ? 'h3' : 'p', { text: heading ? line.replace(/:$/, '') : line }))
    })
    return box
  }

  function gallery(p) {
    var list = images(p)
    var stage = el('div', { class: 'stage' })
    if (!list.length) { stage.textContent = 'No image available'; return el('div', { class: 'gallery' }, [stage]) }
    var main = el('img', { src: list[0], alt: p.nume })
    var count = el('span', { class: 'count' })
    var strip = el('div', { class: 'strip' })
    var at = 0
    function go(i) {
      at = (i + list.length) % list.length
      main.src = list[at]
      count.textContent = (at + 1) + ' / ' + list.length
      Array.prototype.forEach.call(strip.children, function (x, j) { x.setAttribute('aria-current', String(j === at)) })
    }
    stage.appendChild(main)
    if (list.length > 1) {
      var prev = el('button', { class: 'nav prev', type: 'button', 'aria-label': 'Previous image', text: '‹' })
      var next = el('button', { class: 'nav next', type: 'button', 'aria-label': 'Next image', text: '›' })
      prev.addEventListener('click', function () { go(at - 1) })
      next.addEventListener('click', function () { go(at + 1) })
      stage.appendChild(prev); stage.appendChild(next); stage.appendChild(count)
      list.forEach(function (src, i) {
        var b = el('button', { class: 'duo', type: 'button', 'aria-label': 'Image ' + (i + 1) }, [el('img', { src: src, alt: '', loading: 'lazy' })])
        b.addEventListener('click', function () { go(i) })
        strip.appendChild(b)
      })
      document.addEventListener('keydown', function (e) {
        if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
        if (e.key === 'ArrowLeft') go(at - 1)
        if (e.key === 'ArrowRight') go(at + 1)
      })
      go(0)
    }
    return el('div', { class: 'gallery' }, [stage, list.length > 1 ? strip : null])
  }

  // „Ce primești”: doar ce se poate citi din datele produsului, plus livrarea și licența din Termeni.
  function contents(p) {
    var rows = []
    function row(k, v) { if (v) rows.push(el('div', {}, [el('dt', { text: k }), el('dd', { text: v })])) }
    row('File type', kindLabel(kind(p)))
    row('Revit version', revitVersion(p) ? 'Revit ' + revitVersion(p) : '')
    row('Category', category(p))
    row('Delivery', 'Download from your proarh4d.ro account, right after the order is confirmed')
    row('Licence', 'Non-exclusive: personal or commercial use in your own projects; the files may not be redistributed')
    return el('section', { class: 'panel' }, [el('h2', { text: 'At a glance' }), el('dl', {}, rows)])
  }

  function initProduct(root) {
    var id = new URLSearchParams(location.search).get('id') || ''
    if (!/^[0-9a-f-]{20,}$/i.test(id)) return showState(root, 'Product not found', 'The link may be incomplete.', true)

    api('id=eq.' + encodeURIComponent(id) + '&activ=eq.true&select=' + COLUMNS + '&limit=1')
      .then(function (rows) {
        var p = rows[0]
        if (!p) return showState(root, 'Product not found', 'It may have been removed from the catalog.', true)
        document.title = shortName(p) + ' | Proarh.4d Shop'

        var free = isFree(p)
        var off = discount(p)
        var tags = el('div', { class: 'tags' }, (p.tags || []).slice(0, 24).map(function (t) { return el('span', { text: t }) }))

        root.replaceChildren(
          el('div', { class: 'product' }, [
            gallery(p),
            el('div', { class: 'info' }, [
              el('span', { class: 'eyebrow', text: category(p) }),
              el('h1', { text: p.nume }),
              p.descriere_scurta ? el('p', { class: 'lead', text: p.descriere_scurta }) : null,
              el('div', { class: 'buy' }, [
                priceNode(p),
                off ? el('span', { class: 'save', text: 'You save ' + off + '%' }) : null,
                el('a', { class: 'btn', href: buyUrl(p), text: free ? 'Download free on proarh4d.ro' : 'Buy on proarh4d.ro' }),
                el('small', { text: 'You will continue on proarh4d.ro, where you sign in' + (free ? '' : ', pay securely') + ' and download the files from your account.' }),
              ]),
              contents(p),
              describe(p.descriere),
              (p.tags || []).length ? tags : null,
            ]),
          ])
        )

        // alte produse: aceeași categorie întâi
        return api('activ=eq.true&select=' + COLUMNS + '&order=featured.desc,created_at.desc').then(function (all) {
          var others = all.filter(function (x) { return x.id !== p.id })
          others.sort(function (a, b) { return (category(b) === category(p)) - (category(a) === category(p)) })
          var grid = document.getElementById('related-grid')
          if (!grid || !others.length) return
          grid.replaceChildren.apply(grid, others.slice(0, 3).map(card))
          document.getElementById('related').hidden = false
        }).catch(function () {})
      })
      .catch(function () { showError(root) })
  }

  document.addEventListener('DOMContentLoaded', function () {
    var year = document.getElementById('year')
    if (year) year.textContent = new Date().getFullYear()
    var catalog = document.getElementById('catalog')
    var product = document.getElementById('product')
    if (catalog) initHome(catalog)
    if (product) initProduct(product)
  })
})()
