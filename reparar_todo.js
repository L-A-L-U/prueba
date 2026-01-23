/* =========================================
   1. VARIABLES Y CONFIGURACIÓN INICIAL
   ========================================= */
   let usuario = null;

   const Swal = window.Swal.mixin({
       showCloseButton: true,
       allowEscapeKey: true,
       allowOutsideClick: true
   });
   
   // --- BLOQUE DE SEGURIDAD ---
   try {
       const storedUser = localStorage.getItem('usuario');
       if (storedUser && storedUser.startsWith('{')) {
           usuario = JSON.parse(storedUser);
       } else {
           if(storedUser) localStorage.removeItem('usuario');
           usuario = null;
       }
   } catch (e) {
       console.error("Error sesión:", e);
       localStorage.clear();
       usuario = null;
   }
   
   // --- CANDADO DE SEGURIDAD DE SUCURSAL ---
   let sucursalID = 1; // Valor por defecto
   
   if (usuario) {
       // Si NO es admin, lo obligamos a usar SU sucursal asignada.
       if (usuario.rol !== 'admin') {
           sucursalID = usuario.sucursal_id || 1;
           localStorage.setItem('sucursal_activa', sucursalID);
       } 
       // Si ES admin, le permitimos usar la que eligió manualmente o la suya por defecto
       else {
           sucursalID = localStorage.getItem('sucursal_activa') 
               ? parseInt(localStorage.getItem('sucursal_activa')) 
               : (usuario.sucursal_id || 1);
       }
   }
   // ----------------------------------------
   
   let carrito = [], itemTemp = {};
   let cat = []; 
   let modalProdBS = null;
   let editingOrderId = null;
   let currentClient = null;
   let ordenPorLiquidar = null;
   let reportData = { list_ing: [], balance: {ingresos_totales:0, egresos_totales:0, utilidad:0, caja_teorica:0, desglose:{}}, fechas: {} };
   let searchTimeout;
   window.allClients = [];
   
   // Configuración Default
   let DIAS_ENTREGA = 2; 
   let PRECIO_KILO = 32; 
   let MINIMO_KILOS = 3; 
   let DIAS_ABANDONO = 30; 
   
   // Utilerías
   const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
   function notificar(icon, title) { Toast.fire({ icon, title }); }
   function getEl(id) { return document.getElementById(id); }
   const money = (n) => `$${parseFloat(n||0).toLocaleString('es-MX', {minimumFractionDigits:2})}`;
   const safeText = (id, val) => { const el = getEl(id); if(el) el.innerText = val; };
   
   /* =========================================
      2. NAVEGACIÓN Y CARGA
      ========================================= */
   window.nav = function(view) {
       document.querySelectorAll('.view').forEach(e => e.classList.remove('active'));
       const viewEl = document.getElementById('v-' + view);
       if(viewEl) viewEl.classList.add('active');
       
       if(window.innerWidth < 900) {
           const side = document.querySelector('.sidebar');
           if(side) side.classList.remove('show');
       }
   
       if(view === 'pos') { cargarInventarioPOS(); }
       if(view === 'kanban') window.loadKanban();
       if(view === 'inv') window.loadInv();
       if(view === 'hist') window.loadHistorial();
       if(view === 'sucs') window.loadSucursalesTable();
       if(view === 'users') window.loadUsers();
       if(view === 'audit') window.loadAuditoria();
       if(view === 'clientes') window.loadClientesDir();
       if(view === 'rep360') window.loadReport360();
       if(view === 'chofer') window.loadChoferView();
       if(view === 'gastos') window.loadGastosView();
   
       if(view === 'search') {
           const inp = getEl('inputBusquedaFolio');
           const res = getEl('search-result');
           
           if(res) res.style.display = 'none';
           if(inp) { 
               inp.value = ''; 
               setTimeout(() => inp.focus(), 300); 
           }
       }
   };
   
   window.toggleMenu = function() { document.querySelector('.sidebar').classList.toggle('show'); };
   window.logout = function() { localStorage.clear(); location.href='/login.html'; };
   
   /* =========================================
      3. POS (VENTA)
      ========================================= */
   async function cargarInventarioPOS() {
       try {
           const r = await fetch(`/api/gestion/inventario?sucursal_id=${sucursalID}`);
           cat = await r.json();
           window.filt();
       } catch(e){ console.error(e); }
   }
   
   window.filt = function() { 
       const q = getEl('search') ? getEl('search').value.toLowerCase() : ''; 
       const filtered = (cat||[]).filter(p => {
           const nombre = p.nombre.toLowerCase();
           if (q.length > 0) return nombre.includes(q);
           if (nombre.includes('gancho')) return false; 
           if (nombre.includes('lavado')) return false; 
           return true;
       }); 
       
       getEl('grid').innerHTML = filtered.length ? filtered.map(p => `
           <div class="prod" onclick="window.prepararVenta(${p.id})">
               <div class="fs-1 mb-2">${p.tipo==='tintoreria'?'👔':'🏷️'}</div>
               <h6 class="fw-bold m-0 small">${p.nombre}</h6>
               <span class="text-muted small">$${parseFloat(p.precio).toFixed(2)}</span>
               ${p.stock > 0 && p.tipo === 'producto' ? `<span class="badge bg-warning text-dark mt-1">${p.stock} pzas</span>` : ''}
           </div>`).join('') : '<div class="text-center w-100 p-4 text-muted">Sin resultados</div>'; 
   };
   
   let massList = []; 
   let massProductBase = null;
   
   window.prepararVenta = async function(id) {
       const p = cat.find(x => x.id === id);
       if(!p) return;
   
       if(p.tipo === 'tintoreria') {
           const { isConfirmed } = await Swal.fire({
               title: p.nombre, text: "¿Vas a registrar una sola prenda o un lote?", icon: 'question',
               showCancelButton: true, showCloseButton: true,
               confirmButtonText: '📦 Lote (Varias)', cancelButtonText: 'Una sola'
           });
   
           if (isConfirmed) {
               massList = []; massProductBase = p;
               await Swal.fire({
                   title: `Lote: ${p.nombre}`,
                   html: getEl('tplTintoreriaMass').innerHTML,
                   width: '700px',
                   showCancelButton: true, showCloseButton: true,
                   confirmButtonText: 'Terminar y Agregar', cancelButtonText: 'Cancelar',
                   didOpen: () => {
                       setTimeout(() => { const el = document.getElementById('tm-prenda'); if(el) el.focus(); }, 300);
                   },
                   preConfirm: () => { if(massList.length === 0) return Swal.showValidationMessage('Vacío'); return true; }
               });
   
               if (massList.length > 0) {
                   massList.forEach(mItem => {
                       const notaUnica = `${mItem.prenda.toUpperCase()} - ${mItem.marca} [Color: ${mItem.color}]`;
                       const existente = carrito.find(x => x.id === p.id && x.nota === notaUnica);
                       if (existente) { existente.cantidad += parseInt(mItem.cantidad); } 
                       else { carrito.push({ id: p.id, n: p.nombre, p: parseFloat(p.precio), cantidad: parseInt(mItem.cantidad), tipo: 'tintoreria', nota: notaUnica, detalles: mItem }); }
                   });
                   window.saveCart(); window.renderCart(); notificar('success', 'Agregado');
               }
           } else {
               const { value: f } = await Swal.fire({
                   title: `Detalles: ${p.nombre}`, html: getEl('tplTintoreria').innerHTML, showCloseButton: true, focusConfirm: false,
                   preConfirm: () => {
                       const pr = getEl('tin-prenda').value; if(!pr) return Swal.showValidationMessage('Falta prenda');
                       return { prenda: pr, color: getEl('tin-color-picker').value, marca: getEl('tin-marca').value, detalles: getEl('tin-detalles').value }
                   }
               });
               if(f) {
                   const nota = `${f.prenda.toUpperCase()} - ${f.marca} [Color: ${f.color}]`;
                   const ex = carrito.find(x => x.id === p.id && x.nota === nota);
                   if(ex) ex.cantidad++; else carrito.push({ id: p.id, n: p.nombre, p: parseFloat(p.precio), cantidad: 1, tipo: 'tintoreria', nota: nota, detalles: f });
                   window.saveCart(); window.renderCart();
               }
           }
       } else {
           itemTemp = {...p}; getEl('lblProd').innerText = p.nombre; getEl('secPeso').style.display = 'none'; getEl('secCantidad').style.display = 'block'; getEl('inpCantidadModal').value = 1;
           modalProdBS.show(); setTimeout(()=>getEl('inpCantidadModal').focus(), 500);
       }
   };
   
   window.addMassItem = function() {
       const qty = parseInt(getEl('tm-qty').value) || 1;
       const prenda = getEl('tm-prenda').value.trim();
       const color = getEl('tm-color').value.trim();
       const detalles = getEl('tm-detalles').value.trim();
   
       if(!prenda) return getEl('tm-prenda').focus(); 
   
       massList.push({ cantidad: qty, prenda, color: color || 'Sin color', marca: detalles || '', detalles });
       window.renderMassTable();
   
       getEl('tm-qty').value = 1; getEl('tm-prenda').value = ''; getEl('tm-color').value = ''; getEl('tm-detalles').value = ''; getEl('tm-prenda').focus();
   };
   
   window.renderMassTable = function() {
       const tbody = getEl('tm-lista');
       let totalItems = 0;
       tbody.innerHTML = massList.map((item, index) => {
           totalItems += item.cantidad;
           return `<tr><td class="text-center fw-bold text-primary fs-6">${item.cantidad}</td><td class="fw-bold">${item.prenda}</td><td>${item.color}</td><td class="text-end"><i class="bi bi-x-circle text-danger pointer" onclick="window.removeMassItem(${index})"></i></td></tr>`;
       }).join('');
       getEl('tm-count').innerText = totalItems;
   };
   
   window.removeMassItem = function(index) { massList.splice(index, 1); window.renderMassTable(); };
   
   window.addCart = function() {
       const val = parseFloat(getEl('inpCantidadModal').value);
       if(!val || val <= 0) return notificar('warning','Cantidad inválida');
       const idx = carrito.findIndex(x => x.id === itemTemp.id && !x.nota);
       if(idx >= 0) { carrito[idx].cantidad += val; } 
       else { carrito.push({ id: itemTemp.id, n: itemTemp.nombre, p: parseFloat(itemTemp.precio), cantidad: val, tipo: itemTemp.tipo }); }
       window.saveCart(); window.renderCart(); modalProdBS.hide();
   };
   
   window.add = async function(id, n, p, tipo='servicio', qty=1) { 
       carrito.push({id, n, p, cantidad:qty, tipo});
       window.saveCart(); window.renderCart(); 
   };
   
   window.renderCart = function() {
       const t = getEl('ticket'); const tot = getEl('total'); 
       if(!t) return; 
       t.innerHTML = carrito.length ? carrito.map((i,x)=>`
           <div class="d-flex justify-content-between border-bottom py-2 align-items-center">
               <div class="lh-1" style="overflow:hidden;">
                   <span class="fw-bold small text-truncate d-block">${i.n||i.nombre} ${i.cantidad>1 && i.id!==999 ? ` (x${i.cantidad})`:''}</span>
                   <small class="text-muted" style="font-size:10px">${i.nota || ''}</small>
               </div>
               <div class="d-flex align-items-center gap-2">
                   <span class="fw-bold text-dark">$${(parseFloat(i.p||i.precio)*i.cantidad).toFixed(2)}</span>
                   <i class="bi bi-trash text-danger pointer" onclick="carrito.splice(${x},1);window.saveCart();window.renderCart()"></i>
               </div>
           </div>`).join('') : '<div class="text-center text-muted mt-5 small">Carrito Vacío</div>'; 
       const granTotal = carrito.reduce((a,b) => a + (parseFloat(b.p||b.precio) * b.cantidad), 0);
       tot.innerText = `$${granTotal.toFixed(2)}`;
       const btn = getEl('btnPrincipalCobrar');
       if(editingOrderId) {
           btn.innerText = "ACTUALIZAR ORDEN"; btn.className = "btn btn-warning w-100 py-3 fw-bold shadow-sm rounded-3 fs-5";
       } else {
           btn.innerText = "COBRAR"; btn.className = "btn btn-primary w-100 py-3 fw-bold shadow-sm rounded-3 fs-5";
       }
   };
   
   window.saveCart = function() { localStorage.setItem('pos_cart', JSON.stringify(carrito)); };
   window.limpiarCarrito = function() { carrito=[]; window.saveCart(); window.renderCart(); currentClient=null; getEl('selectedClient').style.display='none'; editingOrderId = null; getEl('editModeBanner').style.display = 'none'; };
   
   // --- BOTONES RÁPIDOS ---
   window.addGanchos = async function() { 
       const prod = (cat||[]).find(x => x.nombre.toLowerCase().includes('gancho') && x.tipo === 'producto');
       if (!prod) { return Swal.fire({ icon: 'info', title: 'Falta Configuración', html: 'Crea un producto llamado <b>Ganchos</b> en el catálogo (Tipo: Producto) para controlar su stock.' }); }
       const { value: q } = await Swal.fire({ title: `Vender Ganchos`, text: `Stock: ${prod.stock}`, input: 'number', inputValue: 1, inputAttributes: { min: 1, max: prod.stock } });
       if(q && q>0) window.add(prod.id, prod.nombre, parseFloat(prod.precio), 'producto', parseInt(q)); 
   };
   
   window.addItemLibre = async function() { 
       const {value:f}=await Swal.fire({title:'Concepto Libre', html:'<input id="d" class="swal2-input" placeholder="Descripción"><input id="p" type="number" class="swal2-input" placeholder="Precio Total">', preConfirm:()=>[getEl('d').value, getEl('p').value]}); 
       if(f && f[0] && f[1]) { carrito.push({ id: 666, n: f[0], p: parseFloat(f[1]), cantidad: 1, tipo: 'servicio' }); window.saveCart(); window.renderCart(); }
   };
   
   window.addDiscount = async function() { 
       const {value:d}=await Swal.fire({title:'Descuento ($)', input:'number'}); 
       if(d) { carrito.push({ id: 888, n: 'Descuento', p: -Math.abs(d), cantidad: 1, tipo: 'servicio' }); window.saveCart(); window.renderCart(); }
   };
   
   window.calcularPesaje = async function() { 
       const {value:p} = await Swal.fire({ title: 'Kilos de Ropa', input: 'number', inputAttributes: {min:0, step:0.1}, showCancelButton: true }); 
       if(p) { 
           let pesoReal = parseFloat(p);
           let cobrado = Math.floor(pesoReal);
           if((pesoReal % 1) >= 0.6) cobrado += 1; 
           if(cobrado < MINIMO_KILOS) cobrado = MINIMO_KILOS; 
           let total = cobrado * PRECIO_KILO;
           carrito.push({ id:999, n:'Lavado General', p:total, cantidad:1, nota: `Peso: ${pesoReal}kg | Cobrado: ${cobrado}kg` }); 
           window.saveCart(); window.renderCart(); 
       } 
   };
   
   window.modalProd = async function(id=null) { 
       const p=id?(cat||[]).find(x=>x.id==id):null; 
       const onTypeChange = `onchange="document.getElementById('div-stock').style.display = (this.value==='producto') ? 'block' : 'none'"`;
       const displayStock = (p && p.tipo === 'producto') ? 'block' : 'none';
   
       Swal.fire({ 
           title:p?'Editar':'Nuevo', 
           html:`<div class="text-start">
                 <label>Nombre</label><input id="mp-nom" class="swal2-input w-100 m-0 mb-2" value="${p?p.nombre:''}">
                 <label>Tipo</label><select id="mp-tipo" class="swal2-input w-100 m-0 mb-2" ${onTypeChange}><option value="servicio" ${p?.tipo==='servicio'?'selected':''}>Servicio</option><option value="producto" ${p?.tipo==='producto'?'selected':''}>Producto</option><option value="tintoreria" ${p?.tipo==='tintoreria'?'selected':''}>Tintorería</option></select>
                 <label>Precio</label><input id="mp-pre" class="swal2-input w-100 m-0 mb-2" value="${p?p.precio:''}" placeholder="0.00">
                 <div id="div-stock" style="display:${displayStock}"><label>Stock Inicial</label><input id="mp-stk" class="swal2-input w-100 m-0 mb-2" value="${p?p.stock:0}" type="number"></div>
                 </div>`, 
           preConfirm:()=>{ 
               let t = getEl('mp-tipo').value;
               let s = t==='producto' ? getEl('mp-stk').value : 0; 
               return {id:p?p.id:null, nombre:getEl('mp-nom').value, tipo:t, precio:getEl('mp-pre').value, stock:s, sucursal_id:sucursalID} 
           } 
       }).then(async r=>{ if(r.isConfirmed){ await fetch('/api/gestion/inventario/guardar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(r.value)}); window.loadInv(); } }); 
   };
   
   /* =========================================
      4. COBRO Y TURNO
      ========================================= */
   let turnoActivo = null;
   
   window.checkTurno = async function() { 
       try {
           const btnStatus = document.getElementById('turnoStatus');
           const r = await fetch(`/api/gestion/turno/estado?sucursal_id=${sucursalID}`);
           const d = await r.json();
           
           if(d.abierto) {
               turnoActivo = d.turno; 
               btnStatus.className = 'p-2 rounded-2 bg-success text-white text-center small fw-bold pointer shadow-sm';
               btnStatus.innerHTML = '<i class="bi bi-unlock-fill"></i> CAJA ABIERTA';
               btnStatus.onclick = () => window.cerrarTurnoUI(); 
           } else {
               turnoActivo = null; 
               btnStatus.className = 'p-2 rounded-2 bg-danger text-white text-center small fw-bold pointer shadow-sm';
               btnStatus.innerHTML = '<i class="bi bi-lock-fill"></i> CAJA CERRADA';
               btnStatus.onclick = () => window.abrirTurnoUI(); 
           }
       } catch(e) { console.error("Error turno:", e); }
   };
   
   window.abrirTurnoUI = async function() {
       const { value: monto } = await Swal.fire({
           title: '☀️ Apertura de Caja', text: '¿Con cuánto dinero inicias?', icon: 'info', input: 'number', inputPlaceholder: 'Ej. 500.00', confirmButtonText: 'Abrir Caja', showCancelButton: true
       });
       if(monto) {
           const r = await fetch('/api/gestion/turno/abrir', {
               method: 'POST', headers: {'Content-Type': 'application/json'},
               body: JSON.stringify({ sucursal_id: sucursalID, usuario_id: usuario.id, monto_inicial: monto })
           });
           if(r.ok) { Swal.fire('¡Éxito!', 'Caja abierta.', 'success'); window.checkTurno(); } 
           else { Swal.fire('Error', 'No se pudo abrir', 'error'); }
       }
   };
   
   window.cerrarTurnoUI = async function() {
       const { isConfirmed } = await Swal.fire({
           title: '¿Cerrar Turno?', text: "Se cerrará la venta.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, contar', confirmButtonColor: '#d33'
       });
       if(!isConfirmed) return;
   
       const { value: conteo } = await Swal.fire({
           title: '🔐 Corte Ciego', html: `<p class="small text-muted">Cuenta el efectivo real.</p><h3 class="fw-bold">¿Cuánto hay?</h3><input id="input-corte" type="number" class="swal2-input" placeholder="$0.00">`,
           focusConfirm: false, preConfirm: () => getEl('input-corte').value
       });
   
       if(conteo) {
           Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });
           try {
               const r = await fetch('/api/gestion/turno/cerrar', {
                   method: 'POST', headers: {'Content-Type': 'application/json'},
                   body: JSON.stringify({ sucursal_id: sucursalID, usuario_id: usuario.id, monto_reportado: conteo })
               });
               const d = await r.json();
               if(d.success) {
                   await Swal.fire('Turno Cerrado', 'Registrado correctamente.', 'success');
                   window.checkTurno(); window.location.reload();
               } else { Swal.fire('Error', d.error, 'error'); }
           } catch(e) { Swal.fire('Error', 'Fallo de conexión', 'error'); }
       }
   };
   window.hacerCorteZ = async function() { window.cerrarTurnoUI(); };
   
   window.cobrar = async function() { 
       if(carrito.length===0) return notificar('warning','Vacío');
       if(!turnoActivo) return Swal.fire({ icon: 'error', title: '¡Caja Cerrada!', text: 'Abre turno primero.', confirmButtonText: 'Abrir', preConfirm: () => window.abrirTurnoUI() });
       
       const total = carrito.reduce((a,b)=>a+(parseFloat(b.p||b.precio)*b.cantidad),0);
       await Swal.fire({ 
           title: 'Total a Pagar', html: getEl('tplCobro').innerHTML, showConfirmButton: false, showCloseButton: true, width: '600px',
           didOpen: () => { 
               getEl('lblTotalDisplay').innerText = `$${total.toFixed(2)}`; getEl('lblTotal').innerText = total;
               const fechaSugerida = new Date(); fechaSugerida.setDate(fechaSugerida.getDate() + (window.DIAS_ENTREGA || 2));
               getEl('c-fecha-entrega').value = fechaSugerida.toISOString().slice(0,10); getEl('c-hora-entrega').value = '';
               getEl('p-efectivo').value = ''; getEl('p-tarjeta').value = '';
               window.calcPagos(); 
               if(currentClient && getEl('c-dir')) getEl('c-dir').value = currentClient.direccion_principal || ''; 
               setTimeout(()=>getEl('p-efectivo').focus(), 500); 
           } 
       }); 
   };
   
   window.calcPagos = function() { 
       const total = parseFloat(getEl('lblTotal').innerText); 
       const efec = parseFloat(getEl('p-efectivo').value || 0); 
       const tarj = parseFloat(getEl('p-tarjeta').value || 0); 
       const restante = total - (efec + tarj); 
       
       let btn = getEl('btnFin'); 
       if(!btn) { btn = document.createElement('button'); btn.id = 'btnFin'; document.querySelector('.swal2-html-container').appendChild(btn); } 
       
       btn.onclick = () => window.finalizarVentaMulti(total, [{metodo:'efectivo', monto:efec}, {metodo:'tarjeta', monto:tarj}]); 
   
       if (restante <= 0.5) { 
           const cambio = Math.abs(restante); 
           getEl('lblRestante').innerText = cambio > 0 ? `CAMBIO: $${cambio.toFixed(2)}` : 'COMPLETO'; 
           getEl('lblRestante').className = "m-0 fw-bold text-success display-6"; 
           btn.innerText = editingOrderId ? '💾 ACTUALIZAR' : 'FINALIZAR'; 
           btn.className = 'btn btn-success w-100 mt-3 py-3 fw-bold rounded-4 shadow-sm'; 
           btn.disabled = false; 
       } else { 
           getEl('lblRestante').innerText = `Falta $${restante.toFixed(2)}`; 
           getEl('lblRestante').className = "m-0 fw-bold text-danger display-6"; 
           if((efec+tarj) > 0) {
               btn.innerText = 'Abono Parcial'; btn.className = 'btn btn-warning w-100 mt-3 py-3 fw-bold text-dark rounded-4 shadow-sm';
           } else {
               btn.innerText = '⏳ GUARDAR SIN PAGO'; btn.className = 'btn btn-info w-100 mt-3 py-3 fw-bold text-white rounded-4 shadow-sm';
           }
           btn.disabled = false;
       } 
   };
   
   window.finalizarVentaMulti = async function(total, pagos) { 
       const dom = getEl('entDom').checked; 
       const fechaEntregaManual = getEl('c-fecha-entrega').value;
       if(!fechaEntregaManual) return Swal.showValidationMessage('Selecciona fecha de entrega');
   
       const payload = { 
           sucursal_id: sucursalID, usuario_id: usuario.id, cliente: currentClient || {id:null, nombre:'Público General'}, items: carrito, 
           opciones: { costo_envio: dom ? parseFloat(getEl('c-costo').value||0) : 0, pagos_mixtos: pagos, entrega: dom ? 'domicilio' : 'tienda', direccion: dom ? getEl('c-dir').value : '', factura: getEl('c-factura').checked, horario_entrega: getEl('c-hora-entrega').value, fecha_entrega: fechaEntregaManual } 
       }; 
       
       let url = '/api/ordenes/nueva';
       if(editingOrderId) { url = '/api/ordenes/editar'; payload.orden_id = editingOrderId; } 
       
       try { 
           const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }); 
           const data = await r.json(); 
           if(data.success) { 
               Swal.close(); window.limpiarCarrito(); 
               Swal.fire({icon:'success', title:'Guardado', text: `Folio: ${data.folio||'OK'}`, timer:1500, showConfirmButton:false}); 
               if(!editingOrderId) setTimeout(()=>window.imprimirTicketWeb(data.folio), 800); 
               window.loadKanban(); window.nav('kanban'); 
           } else { Swal.fire('Error', data.error, 'error'); } 
       } catch(e) { Swal.fire('Error', e.message, 'error'); } 
   };
   
   window.toggleEntrega = function() { const d=getEl('entDom').checked; getEl('secEnvio').style.display=d?'block':'none'; window.calcTotal(); };
   window.calcTotal = function() { let base = carrito.reduce((a,b)=>a+(parseFloat(b.p||b.precio)*b.cantidad),0); let env = getEl('entDom').checked ? parseFloat(getEl('c-costo').value||0) : 0; let g = base + env; getEl('lblTotalDisplay').innerText = `$${g.toFixed(2)}`; getEl('lblTotal').innerText = g; window.calcPagos(); };
   
   /* =========================================
      5. BÚSQUEDA Y RASTREO (CORREGIDO)
      ========================================= */
   window.buscarOrden = async function() {
       const input = getEl('inputBusquedaFolio');
       if(!input) return;
       const texto = input.value.trim(); 
       const resultDiv = getEl('search-result');
       const divLista = getEl('res-multiple-list');
       const divDetalle = getEl('res-single-view');
       const divVistaLista = getEl('res-multiple-view');
   
       // AUTO-REPARACIÓN HTML
       if (resultDiv && !divLista) {
           console.warn("Reparando HTML de búsqueda...");
           resultDiv.innerHTML = `
               <div id="res-multiple-view" style="display:none;" class="p-3">
                   <div class="d-flex justify-content-between align-items-center mb-3"><h6 class="fw-bold text-muted m-0">📋 Selecciona:</h6><button class="btn btn-sm btn-outline-secondary" onclick="this.closest('#search-result').style.display='none'">X</button></div>
                   <div id="res-multiple-list" class="list-group"></div>
               </div>
               <div id="res-single-view" style="display:none;">
                   <div class="card-header bg-primary text-white d-flex justify-content-between"><h5 id="res-folio" class="m-0">---</h5><div id="res-saldo" class="badge bg-light text-dark">---</div></div>
                   <div class="card-body">
                       <h5 id="res-cliente" class="card-title text-primary fw-bold">---</h5>
                       <div class="progress mb-2" style="height: 10px;"><div id="res-bar" class="progress-bar bg-secondary" style="width: 0%"></div></div>
                       <div id="res-status-text" class="alert alert-secondary text-center fw-bold">---</div>
                       <ul class="list-group mb-2" id="res-items"></ul>
                       <div id="res-historial-pagos" class="bg-light p-2 small"></div>
                       <div class="d-flex justify-content-between fw-bold mt-2"><span>TOTAL:</span><span id="res-total">$0.00</span></div>
                       <div class="d-flex justify-content-between text-success small"><span>PAGADO:</span><span id="res-pagado">$0.00</span></div>
                       <div id="res-delivery-info" style="display:none" class="mt-2 alert alert-success p-1 small"></div>
                   </div>
               </div>`;
       }
   
       if (texto.length < 3) return Swal.fire('Escribe más', 'Mínimo 3 letras', 'info');
       Swal.fire({title: 'Buscando...', didOpen: () => Swal.showLoading()});
   
       try {
           const r = await fetch(`/api/ordenes/rastreo/${encodeURIComponent(texto)}?sucursal_id=${sucursalID}`);
           const data = await r.json();
           Swal.close();
   
           // Limpieza visual
           resultDiv.style.display = 'none';
           if(divVistaLista) divVistaLista.style.display = 'none';
           if(divDetalle) divDetalle.style.display = 'none';
   
           if (!data.found) return Swal.fire('No encontrado', 'No hay coincidencias.', 'warning');
   
           if (data.multiple) {
               getEl('res-multiple-list').innerHTML = data.resultados.map(o => `
                   <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3" onclick="window.cargarDetalleUnico('${o.folio}')">
                       <div><div class="fw-bold text-primary fs-5">#${o.folio}</div><div class="fw-bold text-dark">${o.cliente_nombre||o.cliente}</div><small class="text-muted">${new Date(o.fecha_creacion).toLocaleDateString()}</small></div>
                       <span class="badge ${o.estatus==='entregado'?'bg-secondary':'bg-success'}">${o.estatus}</span>
                   </button>`).join('');
               getEl('res-multiple-view').style.display = 'block';
               resultDiv.style.display = 'block';
           } else {
               window.renderizarDetalleOrden(data);
           }
       } catch (e) { console.error(e); Swal.fire('Error', 'Fallo de búsqueda', 'error'); }
   };
   
   window.cargarDetalleUnico = async function(folio) {
       Swal.fire({title: 'Cargando...', didOpen: () => Swal.showLoading()});
       try {
           const r = await fetch(`/api/ordenes/rastreo/${folio}?sucursal_id=${sucursalID}`);
           const data = await r.json();
           Swal.close();
           if(data.found) {
               getEl('res-multiple-view').style.display = 'none';
               window.renderizarDetalleOrden(data);
           }
       } catch(e) { Swal.close(); }
   };
   
   window.renderizarDetalleOrden = function(data) {
       const o = data.orden;
       const saldo = parseFloat(o.total) - parseFloat(o.monto_pagado);
       getEl('res-single-view').style.display = 'block';
       
       safeText('res-folio', o.folio);
       safeText('res-cliente', o.cliente_nombre || o.cliente);
       safeText('res-total', money(o.total));
       safeText('res-pagado', money(o.monto_pagado));
       
       const elSaldo = getEl('res-saldo');
       if(elSaldo) {
           elSaldo.innerText = saldo > 0.5 ? `PENDIENTE: ${money(saldo)}` : 'LIQUIDADO';
           elSaldo.className = saldo > 0.5 ? 'badge bg-danger' : 'badge bg-success';
       }
   
       getEl('res-items').innerHTML = data.items.map(i => `<li class="list-group-item d-flex justify-content-between align-items-center"><div><span class="fw-bold">${i.cantidad}x ${i.servicio}</span><br><small>${i.notas||''}</small></div><span class="fw-bold">$${(i.cantidad*i.precio_unitario).toFixed(2)}</span></li>`).join('');
       getEl('res-historial-pagos').innerHTML = data.pagos.length ? data.pagos.map(p => `<div class="d-flex justify-content-between small border-bottom py-1"><span>${new Date(p.fecha).toLocaleDateString()} (${p.metodo_pago})</span><span class="fw-bold text-success">${money(p.monto)}</span></div>`).join('') : 'Sin pagos';
   
       // Barra de tiempo
       const bar = getEl('res-bar');
       const stText = getEl('res-status-text');
       let w='0%', c='bg-secondary', t='PENDIENTE';
       if(o.estatus==='lavando'){w='50%';c='bg-info';t='LAVANDO';}
       if(o.estatus==='listo'){w='75%';c='bg-success';t='LISTO';}
       if(o.estatus==='entregado'){w='100%';c='bg-dark';t='ENTREGADO';}
       if(o.estatus==='cancelada'){w='100%';c='bg-danger';t='CANCELADA';}
       bar.style.width=w; bar.className=`progress-bar ${c}`; stText.className=`alert text-center fw-bold ${c.replace('bg-','alert-')}`; stText.innerText=t;
   
       const divEnt = getEl('res-delivery-info');
       if(divEnt && o.estatus === 'entregado') {
           divEnt.style.display = 'block';
           divEnt.innerHTML = `Entregado por: <b>${data.delivery_info.entregado_por || 'Staff'}</b><br>${new Date(o.fecha_real_entrega).toLocaleString()}`;
       } else if(divEnt) divEnt.style.display = 'none';
   
       getEl('search-result').style.display = 'block';
   };
   
   /* =========================================
      6. CLIENTES
      ========================================= */
   window.handleSearchInput = function(input) { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => window.searchClient(input.value), 400); };
   window.searchClient = async function(q) {
       const div = getEl('clientResults'); if (!q || q.length < 2) { div.style.display = 'none'; return; }
       const r = await fetch(`/api/clientes/buscar?q=${q}&sucursal_id=${sucursalID}`); const matches = await r.json();
       div.innerHTML = matches.length ? matches.slice(0, 5).map(c => `<div class="p-2 border-bottom pointer bg-white" onclick='window.selectClient(${JSON.stringify(c).replace(/'/g, "'")})'><div class="fw-bold">${c.nombre}</div><small>${c.telefono || ''}</small></div>`).join('') : `<div class="p-2 text-center small"><a href="#" onclick="window.modalClient()">Crear</a></div>`; div.style.display = 'block';
   };
   window.selectClient = function(c) { currentClient = c; getEl('clientSearch').value = ''; getEl('clientResults').style.display = 'none'; getEl('selectedClient').style.display = 'flex'; getEl('selCliName').innerText = c.nombre; getEl('selCliInfo').innerText = c.telefono || 'Cliente'; };
   window.clearClient = function() { currentClient = null; getEl('selectedClient').style.display = 'none'; };
   
   window.modalClient = async function(c = null) {
       const { value: form } = await Swal.fire({
           title: c ? 'Editar Cliente' : 'Nuevo Cliente', width: '600px',
           html: `<input id="mc-nom" class="swal2-input" placeholder="Nombre" value="${c?c.nombre:''}">
                  <input id="mc-tel" class="swal2-input" placeholder="Teléfono" value="${c?c.telefono||'':''}">
                  <input id="mc-calle" class="swal2-input" placeholder="Dirección" value="${c?c.direccion_principal||'':''}">
                  <input id="mc-rfc" class="swal2-input" placeholder="RFC" value="${c?c.rfc||'':''}">`,
           preConfirm: () => ({ id: c?.id, nombre: getEl('mc-nom').value, telefono: getEl('mc-tel').value, direccion_principal: getEl('mc-calle').value, rfc: getEl('mc-rfc').value })
       });
       if (form) { 
           if(!form.nombre) return Swal.showValidationMessage('Nombre obligatorio');
           await fetch('/api/clientes/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sucursal_id: sucursalID }) }); 
           window.loadClientesDir(); Swal.fire('Guardado', '', 'success'); 
       }
   };
   window.loadClientesDir = async function() { const r = await fetch(`/api/clientes?sucursal_id=${sucursalID}`); window.allClients = await r.json(); getEl('tblClientes').innerHTML = window.allClients.map((c, i) => `<tr><td><b>${c.nombre}</b></td><td>${c.telefono||''}</td><td>${c.direccion_principal||''}</td><td><button class="btn btn-sm btn-primary" onclick="window.modalClient(window.allClients[${i}])">✏️</button></td></tr>`).join(''); };
   
   /* =========================================
      7. KANBAN Y DETALLES
      ========================================= */
   window.loadKanban = async function() { 
       ['k-pend','k-lav','k-list'].forEach(id=>getEl(id).innerHTML=''); 
       const r = await fetch(`/api/ordenes/listado?sucursal_id=${sucursalID}`); 
       const ord = await r.json(); 
       
       ord.forEach(o => { 
           let c='', b=''; 
           if(o.estatus==='pendiente') { c='k-pend'; b=`<button class="btn btn-sm btn-info w-100 text-white" onclick="window.cambiarEstatus(${o.id}, 'lavando')">Lavando ➡️</button>`; } 
           else if(o.estatus==='lavando') { c='k-lav'; b=`<button class="btn btn-sm btn-success w-100" onclick="window.cambiarEstatus(${o.id}, 'listo')">Listo ✅</button>`; } 
           else if(o.estatus==='listo') { c='k-list'; b=`<button class="btn btn-sm btn-dark w-100" onclick="window.entregar(${o.id})">Entregar 👋</button>`; } 
           
           if(c) getEl(c).innerHTML += `<div class="card p-3 mb-2 shadow-sm border-0" onclick="window.verDetalles(${o.id},'${o.folio}')"><div class="d-flex justify-content-between mb-2"><span class="badge bg-light text-dark border">${o.folio}</span>${o.saldo>0?`<span class="badge bg-danger">${money(o.saldo)}</span>`:'<span class="badge bg-success">OK</span>'}</div><div class="fw-bold text-truncate">${o.cliente}</div><div class="mt-2" onclick="event.stopPropagation()">${b}</div></div>`; 
       }); 
   };
   
   window.cambiarEstatus = async function(id, s) { await fetch('/api/ordenes/estatus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estatus: s }) }); window.loadKanban(); window.loadChoferView(); };
   window.entregar = async function(id) { if(await confirmAction('¿Confirmar entrega?')) window.cambiarEstatus(id, 'entregado'); };
   
   window.verDetalles = async function(id, f) {
       const r = await fetch(`/api/ordenes/${id}/detalles`); const i = await r.json();
       getEl('listaDetalles').innerHTML = i.map(x => `<li class="list-group-item d-flex justify-content-between px-4 py-3"><div><span class="fw-bold">${x.cantidad}x ${x.servicio}</span><br><small>${x.notas || ''}</small></div><span>$${(x.precio_unitario * x.cantidad).toFixed(2)}</span></li>`).join('');
       getEl('det-folio').innerText = f; getEl('modalDetalles').setAttribute('data-folio', f); getEl('modalDetalles').setAttribute('data-id', id);
       const rOrd = await fetch(`/api/ordenes/${f}/full`); const dOrd = await rOrd.json(); const saldo = dOrd.info.total - dOrd.info.monto_pagado;
       getEl('btnLiquidarContainer').innerHTML = saldo > 0.5 ? `<button class="btn btn-success w-100 py-3" onclick="window.abrirLiquidacion(${id}, ${saldo})">LIQUIDAR ($${saldo.toFixed(2)})</button>` : '';
       new bootstrap.Modal(getEl('modalDetalles')).show();
   };
   
   window.abrirLiquidacion = function(id, saldo) { 
       ordenPorLiquidar = { id, saldo }; 
       getEl('liqMonto').innerText = money(saldo); getEl('liq-recibido').value = ''; getEl('liq-cambio').innerText = '$0.00';
       new bootstrap.Modal(getEl('modalLiquidar')).show(); 
       setTimeout(() => getEl('liq-recibido').focus(), 500);
   };
   
   window.calcCambioLiq = function() {
       if (!ordenPorLiquidar) return;
       const deuda = parseFloat(ordenPorLiquidar.saldo);
       const recibido = parseFloat(getEl('liq-recibido').value) || 0;
       const cambio = recibido - deuda;
       getEl('liq-cambio').innerText = cambio >= 0 ? money(cambio) : `Falta ${money(Math.abs(cambio))}`;
       getEl('liq-cambio').className = cambio >= 0 ? 'h4 fw-bold text-success' : 'h4 fw-bold text-danger';
   };
   
   window.confirmarLiquidacion = async function(metodo) { 
       if (!ordenPorLiquidar) return; 
       await fetch('/api/ordenes/liquidar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden_id: ordenPorLiquidar.id, monto: ordenPorLiquidar.saldo, metodo_pago: metodo, usuario_id: usuario.id, sucursal_id: sucursalID }) }); 
       bootstrap.Modal.getInstance(getEl('modalLiquidar')).hide(); bootstrap.Modal.getInstance(getEl('modalDetalles')).hide(); 
       Swal.fire('Pagado', '', 'success'); window.loadKanban(); 
   };
   
   window.cancelarOrdenDesdeModal = async function() { 
       const modalEl = document.getElementById('modalDetalles');
       const id = modalEl.getAttribute('data-id');
       const bsModal = bootstrap.Modal.getInstance(modalEl);
       bsModal.hide();
       const { value: m } = await Swal.fire({ title: '¿Motivo?', input: 'text', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Cancelar Orden' }); 
       if (m) { 
           await fetch('/api/ordenes/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, motivo: m, usuario_id: usuario.id }) });
           window.loadKanban(); Swal.fire('Cancelada', '', 'success');
       } else { bsModal.show(); }
   };
   
   /* =========================================
      8. UTILIDADES Y OTROS MÓDULOS
      ========================================= */
   window.loadConfig = async function() { 
       if((usuario.rol||'').toLowerCase().trim()!=='admin') return; 
       const r = await fetch(`/api/gestion/config?sucursal_id=${sucursalID}`); const c = await r.json(); 
       if(c) { 
           ['conf-header','conf-dir','conf-tel','conf-footer','conf-legal'].forEach(k => { if(getEl(k)) getEl(k).value = c[k.replace('conf-','ticket_').replace('dir','direccion').replace('tel','telefono')] || ''; });
           DIAS_ENTREGA = parseInt(c.dias_entrega) || 2; 
       } 
   };
   window.guardarConfigDB = async function() { 
       const d = { sucursal_id: sucursalID, ticket_header: getEl('conf-header').value, direccion: getEl('conf-dir').value, telefono: getEl('conf-tel').value, ticket_footer: getEl('conf-footer').value, ticket_legal: getEl('conf-legal').value };
       await fetch('/api/gestion/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(d) });
       Swal.fire('Guardado', '', 'success'); 
   };
   
   window.imprimirTicketWeb = async function(folio) {
       if (!folio) return;
       try {
           const rConf = await fetch(`/api/gestion/config?sucursal_id=${sucursalID}`); const tc = await rConf.json(); 
           const rOrder = await fetch(`/api/ordenes/${folio}/full?sucursal_id=${sucursalID}`); const data = await rOrder.json();
           const o = data.info; const items = data.items;
           
           // Generar HTML simple para ticket
           const html = `<div class="ticket-page" style="width:58mm;font-family:monospace;font-size:12px;color:black;">
               <center><b>${tc.ticket_header}</b><br>${tc.direccion}<br>${tc.telefono}<br>${new Date().toLocaleString()}</center>
               <br>FOLIO: <b>${o.folio}</b><br>CLIENTE: ${o.cliente}<hr>
               ${items.map(i=>`${i.cantidad} ${i.servicio} $${(i.cantidad*i.precio_unitario).toFixed(2)}`).join('<br>')}
               <hr>TOTAL: $${o.total}<br>ABONO: $${o.monto_pagado}<br><b>RESTA: $${(o.total-o.monto_pagado).toFixed(2)}</b><br><br>
               <center>${tc.ticket_footer}</center>
           </div>`;
           getEl('printableTicket').innerHTML = (usuario.rol === 'delivery') ? html : html+html;
           setTimeout(() => window.print(), 500);
       } catch(e) { console.error(e); }
   };
   window.imprimirTicketDesdeModal = function() { const f = getEl('modalDetalles').getAttribute('data-folio'); if(f) window.imprimirTicketWeb(f); };
   
   window.loadUsers = async function() { const r = await fetch('/api/gestion/usuarios'); const u = await r.json(); getEl('tblUsers').innerHTML = u.map(x => `<tr><td>${x.nombre}</td><td>${x.rol}</td><td><button class="btn btn-sm btn-outline-danger" onclick="window.delUser(${x.id})">Borrar</button></td></tr>`).join(''); };
   window.modalUser = async function() { 
       const r = await fetch('/api/gestion/sucursales'); const s = await r.json();
       const { value: f } = await Swal.fire({ title: 'Nuevo Usuario', html: `<input id="un" class="swal2-input" placeholder="Nombre"><input id="uu" class="swal2-input" placeholder="Login"><input id="up" type="password" class="swal2-input" placeholder="Pass"><select id="ur" class="swal2-input"><option value="cajero">Cajero</option><option value="admin">Admin</option></select><select id="us" class="swal2-input">${s.map(x=>`<option value="${x.id}">${x.nombre}</option>`)}</select>`, preConfirm: () => ({ nombre: getEl('un').value, usuario: getEl('uu').value, password: getEl('up').value, rol: getEl('ur').value, sucursal_id: getEl('us').value }) });
       if (f) { await fetch('/api/gestion/usuarios/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); window.loadUsers(); } 
   };
   window.delUser = async function(id) { if(await confirmAction()) { await fetch('/api/gestion/usuarios/borrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); window.loadUsers(); } };
   
   window.loadSucursalesTable = async function() { const r = await fetch('/api/gestion/sucursales'); const d = await r.json(); getEl('tblSucursales').innerHTML = d.map(s => `<tr><td>${s.nombre}</td><td>${s.prefijo}</td></tr>`).join(''); };
   window.modalSucursal = async function() { const { value: f } = await Swal.fire({ title: 'Nueva Sucursal', html: `<input id="sn" class="swal2-input" placeholder="Nombre"><input id="sp" class="swal2-input" placeholder="Prefijo">`, preConfirm: () => ({ nombre: getEl('sn').value, prefijo: getEl('sp').value, direccion:'', telefono:'' }) }); if(f) { await fetch('/api/gestion/sucursales/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); window.loadSucursalesTable(); } };
   
   window.loadAuditoria = async function() { 
       const r = await fetch(`/api/gestion/auditoria?sucursal_id=${sucursalID}`); const d = await r.json(); 
       getEl('tblAudit').innerHTML = d.map(a => `<tr><td><small>${new Date(a.fecha).toLocaleString()}</small></td><td>${a.usuario_nombre}</td><td>${a.modulo}</td><td>${a.accion}</td><td class="small">${a.detalles}</td></tr>`).join(''); 
   };
   
   // OTROS
   window.confirmAction = async function(msg = '¿Seguro?') { const r = await Swal.fire({ title: msg, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' }); return r.isConfirmed; };
   window.loadInv = async function() { const r = await fetch(`/api/gestion/inventario?sucursal_id=${sucursalID}`); cat = await r.json(); window.filt(); const tbl = getEl('tblInv'); if(tbl) tbl.innerHTML = cat.map(p => `<tr><td>${p.nombre}</td><td>${p.tipo}</td><td>$${p.precio}</td><td>${p.stock}</td><td class="text-end"><button class="btn btn-sm btn-primary" onclick="window.modalProd(${p.id})">✏️</button><button class="btn btn-sm btn-outline-danger" onclick="window.delProd(${p.id})">🗑️</button></td></tr>`).join(''); };
   window.delProd = async function(id) { if(await confirmAction('¿Eliminar?')) { await fetch('/api/gestion/inventario/borrar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id, usuario_id: usuario.id}) }); window.loadInv(); } };
   window.cargarSelectorSucursales = async function() { if((usuario.rol||'').trim() === 'admin'){ const r = await fetch('/api/gestion/sucursales'); const s = await r.json(); getEl('selSucursal').innerHTML = s.map(x => `<option value="${x.id}" ${x.id == sucursalID ? 'selected' : ''}>${x.nombre}</option>`).join(''); getEl('sucursal-selector-container').style.display = 'block'; } };
   window.cambiarSucursal = function(id) { localStorage.setItem('sucursal_activa', id); location.reload(); };
   
   /* =========================================
      9. INICIALIZACIÓN
      ========================================= */
   if(usuario) {
       document.addEventListener('DOMContentLoaded', () => {
           try { modalProdBS = new bootstrap.Modal(getEl('modalProd'), {backdrop: 'static'}); } catch(e){}
           const localISO = new Date().toISOString().slice(0, 10);
           ['h-ini','h-fin','rep-ini','rep-fin','choferFecha','gasto-ini','gasto-fin'].forEach(id => { if(getEl(id)) getEl(id).value = localISO; });
   
           if(getEl('uName')) getEl('uName').innerText = usuario.nombre;
           if(getEl('avT')) getEl('avT').innerText = usuario.nombre.charAt(0).toUpperCase();
           if(getEl('uRole')) getEl('uRole').innerText = usuario.rol.toUpperCase();
           if (usuario.rol !== 'admin') document.querySelectorAll('.admin-only').forEach(e => e.classList.add('d-none'));
   
           window.cargarSelectorSucursales();
           window.checkTurno();
           window.loadConfig(); 
           window.loadInv();
   
           const savedCart = localStorage.getItem('pos_cart');
           if (savedCart) { try { carrito = JSON.parse(savedCart); window.renderCart(); } catch(e){} }
   
           window.nav('pos');
       });
   }