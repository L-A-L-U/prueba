/* =========================================
   1. VARIABLES Y CONFIGURACIÓN INICIAL
   ========================================= */
   let usuario = null;

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
   
   // Priorizar la sucursal seleccionada manualmente
   let sucursalID = localStorage.getItem('sucursal_activa') 
       ? parseInt(localStorage.getItem('sucursal_activa')) 
       : (usuario ? (usuario.sucursal_id || 1) : 1);
   
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
   
   // --- CATÁLOGOS SAT COMPLETOS (CFDI 4.0) ---
   const REGIMENES = [
       {c:"601",d:"General de Ley Personas Morales"},
       {c:"603",d:"Personas Morales con Fines no Lucrativos"},
       {c:"605",d:"Sueldos y Salarios e Ingresos Asimilados a Salarios"},
       {c:"606",d:"Arrendamiento"},
       {c:"607",d:"Régimen de Enajenación o Adquisición de Bienes"},
       {c:"608",d:"Demás ingresos"},
       {c:"610",d:"Residentes en el Extranjero sin Establecimiento Permanente en México"},
       {c:"611",d:"Ingresos por Dividendos (socios y accionistas)"},
       {c:"612",d:"Personas Físicas con Actividades Empresariales y Profesionales"},
       {c:"614",d:"Ingresos por intereses"},
       {c:"615",d:"Régimen de los ingresos por obtención de premios"},
       {c:"616",d:"Sin obligaciones fiscales"},
       {c:"620",d:"Sociedades Cooperativas de Producción que optan por diferir sus ingresos"},
       {c:"621",d:"Incorporación Fiscal"},
       {c:"622",d:"Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras"},
       {c:"623",d:"Opcional para Grupos de Sociedades"},
       {c:"624",d:"Coordinados"},
       {c:"625",d:"Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas"},
       {c:"626",d:"Régimen Simplificado de Confianza"}
   ];
   
   const USOS_CFDI = [
       {c:"G01",d:"Adquisición de mercancías"},
       {c:"G02",d:"Devoluciones, descuentos o bonificaciones"},
       {c:"G03",d:"Gastos en general"},
       {c:"I01",d:"Construcciones"},
       {c:"I02",d:"Mobiliario y equipo de oficina por inversiones"},
       {c:"I03",d:"Equipo de transporte"},
       {c:"I04",d:"Equipo de computo y accesorios"},
       {c:"I05",d:"Dados, troqueles, moldes, matrices y herramental"},
       {c:"I06",d:"Comunicaciones telefónicas"},
       {c:"I07",d:"Comunicaciones satelitales"},
       {c:"I08",d:"Otra maquinaria y equipo"},
       {c:"D01",d:"Honorarios médicos, dentales y gastos hospitalarios"},
       {c:"D02",d:"Gastos médicos por incapacidad o discapacidad"},
       {c:"D03",d:"Gastos funerales"},
       {c:"D04",d:"Donativos"},
       {c:"D05",d:"Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)"},
       {c:"D06",d:"Aportaciones voluntarias al SAR"},
       {c:"D07",d:"Primas por seguros de gastos médicos"},
       {c:"D08",d:"Gastos de transportación escolar obligatoria"},
       {c:"D09",d:"Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones"},
       {c:"D10",d:"Pagos por servicios educativos (colegiaturas)"},
       {c:"S01",d:"Sin efectos fiscales"},
       {c:"CP01",d:"Pagos"},
       {c:"CN01",d:"Nómina"}
   ];
   
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
       const viewEl = getEl('v-' + view);
       if(viewEl) viewEl.classList.add('active');
       
       if(window.innerWidth < 900) document.querySelector('.sidebar').classList.remove('show');
   
       // Cargas dinámicas
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
   
   window.prepararVenta = async function(id) {
       const p = cat.find(x => x.id === id);
       if(!p) return;
   
       if(p.tipo === 'tintoreria') {
           const { value: f } = await Swal.fire({
               title: `Detalles: ${p.nombre}`,
               html: getEl('tplTintoreria').innerHTML, 
               focusConfirm: false,
               preConfirm: () => ({
                   color: getEl('tin-color-picker').value,
                   marca: getEl('tin-marca').value,
                   detalles: getEl('tin-detalles').value
               })
           });
           if(f) {
               carrito.push({ 
                   id: p.id, n: p.nombre, p: parseFloat(p.precio), cantidad: 1, tipo: 'tintoreria',
                   nota: `[${f.marca}] ${f.detalles} (Color: ${f.color})`, detalles: f 
               });
               window.saveCart(); window.renderCart();
           }
       } else {
           itemTemp = {...p};
           getEl('lblProd').innerText = p.nombre;
           getEl('secPeso').style.display = 'none'; 
           getEl('secCantidad').style.display = 'block';
           getEl('inpCantidadModal').value = 1;
           
           modalProdBS.show();
           setTimeout(()=>getEl('inpCantidadModal').focus(), 500);
       }
   };
   
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
   
   // --- MODAL PRODUCTOS (GESTIÓN) ---
   window.modalProd = async function(id=null) { 
       const p=id?(cat||[]).find(x=>x.id==id):null; 
       
       // VISUAL: Stock solo visible si el tipo es 'producto'
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
      4. COBRO
      ========================================= */
    window.cobrar = async function() { 
        if(carrito.length===0) return notificar('warning','Vacío');
        
        const total = carrito.reduce((a,b)=>a+(parseFloat(b.p||b.precio)*b.cantidad),0);
        
        await Swal.fire({ 
            title:'', 
            html: getEl('tplCobro').innerHTML, 
            showConfirmButton: false, 
            didOpen: () => { 
                getEl('lblTotalDisplay').innerText = `$${total.toFixed(2)}`; 
                getEl('lblTotal').innerText = total; 
                
                // FECHA SUGERIDA (Hoy + días config)
                const fechaSugerida = new Date();
                fechaSugerida.setDate(fechaSugerida.getDate() + (window.DIAS_ENTREGA || 2));
                getEl('c-fecha-entrega').value = fechaSugerida.toISOString().slice(0,10);

                // LIMPIAR INPUTS (Para que empiecen en 0/vacíos)
                getEl('p-efectivo').value = ''; 
                getEl('p-tarjeta').value = ''; 
                
                window.calcPagos(); 
                
                if(currentClient) { 
                    if(getEl('c-dir')) getEl('c-dir').value = currentClient.direccion_principal || ''; 
                } 
                setTimeout(()=>getEl('p-efectivo').focus(), 500); 
            } 
        }); 
    };
   
   // REEMPLAZAR ESTA FUNCIÓN EN app.js

    window.calcPagos = function() { 
        const total = parseFloat(getEl('lblTotal').innerText); 
        
        const efec = parseFloat(getEl('p-efectivo').value || 0); 
        const tarj = parseFloat(getEl('p-tarjeta').value || 0); 
        
        const restante = total - (efec + tarj); 
        
        let btn = getEl('btnFin'); 
        if(!btn) { 
            btn = document.createElement('button'); 
            btn.id = 'btnFin'; 
            document.querySelector('.swal2-html-container').appendChild(btn); 
        } 
        
        btn.onclick = () => window.finalizarVentaMulti(total, [
            {metodo:'efectivo', monto:efec},
            {metodo:'tarjeta', monto:tarj}
        ]); 

        // SI ESTÁ COMPLETO
        if (restante <= 0.5) { 
            const cambio = Math.abs(restante); 
            getEl('lblRestante').innerText = cambio > 0 ? `CAMBIO: $${cambio.toFixed(2)}` : 'COMPLETO'; 
            getEl('lblRestante').className = "m-0 fw-bold text-success display-6"; 
            
            btn.innerText = editingOrderId ? '💾 ACTUALIZAR' : 'FINALIZAR'; 
            btn.className = 'btn btn-success w-100 mt-3 py-3 fw-bold rounded-4 shadow-sm'; 
            btn.disabled = false; 
        } 
        // SI FALTA DINERO (O ES CERO)
        else { 
            getEl('lblRestante').innerText = `Falta $${restante.toFixed(2)}`; 
            getEl('lblRestante').className = "m-0 fw-bold text-danger display-6"; 
            
            // AQUÍ ESTÁ EL CAMBIO:
            if((efec+tarj) > 0) {
                // Caso: Está dando un anticipo
                btn.innerText = 'Abono Parcial'; 
                btn.className = 'btn btn-warning w-100 mt-3 py-3 fw-bold text-dark rounded-4 shadow-sm';
            } else {
                // Caso: No ha puesto nada (Pago pendiente)
                btn.innerText = '⏳ GUARDAR SIN PAGO';
                btn.className = 'btn btn-info w-100 mt-3 py-3 fw-bold text-white rounded-4 shadow-sm';
            }
            // IMPORTANTE: Ya no deshabilitamos el botón
            btn.disabled = false;
        } 
    };
   
   window.finalizarVentaMulti = async function(total, pagos) { 
        const dom = getEl('entDom').checked; 
        
        // Capturar fecha del calendario
        const fechaEntregaManual = getEl('c-fecha-entrega').value;
        if(!fechaEntregaManual) return Swal.showValidationMessage('Selecciona fecha de entrega');

        const payload = { 
            sucursal_id: sucursalID, 
            usuario_id: usuario.id, 
            cliente: currentClient || {id:null, nombre:'Público General'}, 
            items: carrito, 
            opciones: { 
                costo_envio: dom ? parseFloat(getEl('c-costo').value||0) : 0, 
                pagos_mixtos: pagos, 
                entrega: dom ? 'domicilio' : 'tienda', 
                direccion: dom ? getEl('c-dir').value : '', 
                factura: getEl('c-factura').checked,
                fecha_entrega: fechaEntregaManual // <--- ESTO ES LO NUEVO
            } 
        }; 
        
        let url = '/api/ordenes/nueva'; 
        if(editingOrderId) { 
            url = '/api/ordenes/editar'; 
            payload.orden_id = editingOrderId; 
        } 
        
        try { 
            const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }); 
            const data = await r.json(); 
            if(data.success) { 
                Swal.close(); 
                window.limpiarCarrito(); 
                Swal.fire({icon:'success', title:'Guardado', text: `Folio: ${data.folio||'OK'}`, timer:1500, showConfirmButton:false}); 
                if(!editingOrderId) setTimeout(()=>window.imprimirTicketWeb(data.folio), 800); 
                window.loadKanban(); 
                window.nav('kanban'); 
            } else { 
                Swal.fire('Error', data.error, 'error'); 
            } 
        } catch(e) { 
            Swal.fire('Error', e.message, 'error'); 
        } 
    };
   window.toggleEntrega = function() { const d=getEl('entDom').checked; getEl('secEnvio').style.display=d?'block':'none'; window.calcTotal(); };
   window.calcTotal = function() { let base = carrito.reduce((a,b)=>a+(parseFloat(b.p||b.precio)*b.cantidad),0); let env = getEl('entDom').checked ? parseFloat(getEl('c-costo').value||0) : 0; let g = base + env; getEl('lblTotalDisplay').innerText = `$${g.toFixed(2)}`; getEl('lblTotal').innerText = g; window.calcPagos(); };
   
   /* =========================================
      5. CLIENTES (MODAL COMPLETO RESTAURADO)
      ========================================= */
   window.handleSearchInput = function(input) { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => window.searchClient(input.value), 400); };
   window.searchClient = async function(q) {
       const div = getEl('clientResults'); if (!q || q.length < 2) { div.style.display = 'none'; return; }
       const r = await fetch(`/api/clientes/buscar?q=${q}&sucursal_id=${sucursalID}`); const matches = await r.json();
       div.innerHTML = matches.length ? matches.slice(0, 5).map(c => `<div class="p-2 border-bottom pointer bg-white" onclick='window.selectClient(${JSON.stringify(c).replace(/'/g, "'")})'><div class="fw-bold">${c.nombre}</div><small>${c.telefono || ''}</small></div>`).join('') : `<div class="p-2 text-center small"><a href="#" onclick="window.modalClient()">Crear</a></div>`; div.style.display = 'block';
   };
   window.selectClient = function(c) { currentClient = c; getEl('clientSearch').value = ''; getEl('clientResults').style.display = 'none'; getEl('selectedClient').style.display = 'flex'; getEl('selCliName').innerText = c.nombre; getEl('selCliInfo').innerText = c.telefono || 'Cliente'; };
   window.clearClient = function() { currentClient = null; getEl('selectedClient').style.display = 'none'; };
   
   // MODAL DE CLIENTE PROFESIONAL (CFDI 4.0 COMPLETO)
   window.modalClient = async function(c = null) {
       // Generar opciones de forma limpia
       const regOpts = REGIMENES.map(r => `<option value="${r.c}" ${c && c.regimen_fiscal === r.c ? 'selected' : ''}>${r.c} - ${r.d}</option>`).join('');
       const usoOpts = USOS_CFDI.map(u => `<option value="${u.c}" ${c && c.uso_cfdi === u.c ? 'selected' : ''}>${u.c} - ${u.d}</option>`).join('');
       
       const { value: form } = await Swal.fire({
           title: c ? 'Editar Cliente' : 'Nuevo Cliente',
           width: '700px',
           html: `
           <div class="text-start container-fluid px-0">
               <h6 class="text-primary border-bottom pb-2 mb-3 fw-bold"><i class="bi bi-person-circle"></i> Datos de Contacto</h6>
               <div class="mb-2">
                   <label class="form-label small fw-bold">Nombre / Razón Social *</label>
                   <input id="mc-nom" class="form-control" placeholder="Como aparece en la Constancia" value="${c ? c.nombre : ''}">
               </div>
               <div class="row g-2 mb-3">
                   <div class="col-6">
                       <label class="form-label small fw-bold">Teléfono</label>
                       <input id="mc-tel" class="form-control" placeholder="10 dígitos" value="${c ? c.telefono || '' : ''}">
                   </div>
                   <div class="col-6">
                       <label class="form-label small fw-bold">Email (Facturas)</label>
                       <input id="mc-email" class="form-control" placeholder="cliente@email.com" value="${c ? c.email || '' : ''}">
                   </div>
               </div>
   
               <h6 class="text-danger border-bottom pb-2 mb-3 fw-bold"><i class="bi bi-receipt"></i> Datos Fiscales (SAT 4.0)</h6>
               <div class="row g-2 mb-2">
                   <div class="col-8">
                       <label class="form-label small fw-bold">RFC</label>
                       <input id="mc-rfc" class="form-control text-uppercase" placeholder="XAXX010101000" value="${c ? c.rfc || '' : ''}">
                   </div>
                   <div class="col-4">
                       <label class="form-label small fw-bold">C.P. Fiscal</label>
                       <input id="mc-cp" class="form-control" placeholder="00000" value="${c ? c.codigo_postal || '' : ''}">
                   </div>
               </div>
               <div class="mb-2">
                   <label class="form-label small fw-bold">Régimen Fiscal</label>
                   <select id="mc-regimen" class="form-select text-muted"><option value="">Seleccione...</option>${regOpts}</select>
               </div>
               <div class="mb-3">
                   <label class="form-label small fw-bold">Uso de CFDI</label>
                   <select id="mc-uso" class="form-select text-muted"><option value="">Seleccione...</option>${usoOpts}</select>
               </div>
   
               <h6 class="text-muted border-bottom pb-2 mb-3 fw-bold"><i class="bi bi-geo-alt-fill"></i> Entrega a Domicilio</h6>
               <div class="mb-2">
                   <input id="mc-calle" class="form-control" placeholder="Calle, Número, Colonia, Referencias" value="${c ? c.direccion_principal || '' : ''}">
               </div>
           </div>`,
           showCancelButton: true,
           confirmButtonText: 'Guardar Cliente',
           focusConfirm: false,
           preConfirm: () => {
               const n = getEl('mc-nom').value;
               if (!n) return Swal.showValidationMessage('El nombre es obligatorio');
               return { 
                   id: c ? c.id : null, 
                   nombre: n, 
                   telefono: getEl('mc-tel').value, 
                   email: getEl('mc-email').value,
                   direccion_principal: getEl('mc-calle').value, 
                   rfc: getEl('mc-rfc').value, 
                   regimen_fiscal: getEl('mc-regimen').value, 
                   uso_cfdi: getEl('mc-uso').value, 
                   codigo_postal: getEl('mc-cp').value 
               }
           }
       });
   
       if (form) { 
           try {
               await fetch('/api/clientes/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sucursal_id: sucursalID }) }); 
               window.loadClientesDir();
               Swal.fire({ icon: 'success', title: 'Guardado', timer: 1500, showConfirmButton: false });
           } catch(e) { Swal.fire('Error', 'No se pudo guardar', 'error'); }
       }
   };
   
   window.loadClientesDir = async function() { const r = await fetch(`/api/clientes?sucursal_id=${sucursalID}`); const data = await r.json(); window.allClients = data; getEl('tblClientes').innerHTML = data.map((c, i) => `<tr><td><b>${c.nombre}</b><br><small class="text-muted">${c.rfc || ''}</small></td><td>${c.telefono||''}</td><td><small>${c.direccion_principal||''}</small></td><td class="text-end"><button class="btn btn-sm btn-primary" onclick="window.prepEditClient(${i})">✏️</button></td></tr>`).join(''); };
   window.prepEditClient = function(i) { window.modalClient(window.allClients[i]); };
   
   /* =========================================
      6. KANBAN Y ORDENES
      ========================================= */
   window.loadKanban = async function() { 
       ['k-pend','k-lav','k-list'].forEach(id=>getEl(id).innerHTML=''); 
       const r = await fetch(`/api/ordenes/listado?sucursal_id=${sucursalID}`); 
       const ord = await r.json(); 
       ord.forEach(o => { 
           let c='', b='', estiloCard='border-left: 4px solid var(--accent) !important;', iconoAlerta=''; 
           let btnWA = o.telefono ? `<a href="https://wa.me/52${o.telefono.replace(/\D/g,'')}" target="_blank" class="btn btn-sm btn-success text-white ms-1" onclick="event.stopPropagation()"><i class="bi bi-whatsapp"></i></a>` : '';
           let diasAnt = o.fecha_creacion ? Math.floor(Math.abs(new Date() - new Date(o.fecha_creacion)) / 86400000) : 0; 
           if(o.estatus==='pendiente') { c='k-pend'; b=`<div class="d-flex"><button class="btn btn-sm btn-info w-100 text-white fw-bold shadow-sm" onclick="window.cambiarEstatus(${o.id}, 'lavando')">Lavando ➡️</button>${btnWA}</div>`; } 
           else if(o.estatus==='lavando') { c='k-lav'; b=`<div class="d-flex"><button class="btn btn-sm btn-success w-100 fw-bold shadow-sm" onclick="window.cambiarEstatus(${o.id}, 'listo')">Listo ✅</button>${btnWA}</div>`; } 
           else if(o.estatus==='listo') { c='k-list'; b=`<div class="d-flex"><button class="btn btn-sm btn-dark w-100 fw-bold shadow-sm" onclick="window.entregar(${o.id})">Entregar 👋</button>${btnWA}</div>`; if(diasAnt >= DIAS_ABANDONO) { estiloCard='border-left: 4px solid #6f42c1 !important; background-color: #f3e5f5;'; iconoAlerta=`<div class="badge bg-purple text-white mb-1" style="background:#6f42c1">🕸️ OLVIDADO (${diasAnt} DÍAS)</div>`; } } 
           if(c) getEl(c).innerHTML += `<div class="card p-3 mb-2 shadow-sm border-0 rounded-3" style="cursor:pointer; ${estiloCard}" onclick="window.verDetalles(${o.id},'${o.folio}')">${iconoAlerta}<div class="d-flex justify-content-between mb-2"><span class="badge bg-light text-dark border">${o.folio}</span>${o.saldo>0?`<span class="badge bg-danger">DEBE ${money(o.saldo)}</span>`:'<span class="badge bg-success">PAGADO</span>'}</div><div class="fw-bold text-truncate">${o.cliente}</div><div class="small text-muted mb-2">${money(o.total)}</div><div class="mt-2" onclick="event.stopPropagation()">${b}</div></div>`; 
       }); 
   };
   
   // --- FUNCIÓN DE CAMBIO DE ESTATUS INTELIGENTE ---
   window.cambiarEstatus = async function(id, s) { 
       try {
           await fetch('/api/ordenes/estatus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estatus: s }) });
           // Recargar la vista activa
           if(getEl('v-chofer').classList.contains('active')) {
               window.loadChoferView();
               notificar('success', 'Estatus actualizado');
           } else {
               window.loadKanban();
           }
       } catch(e) { console.error(e); }
   };
   
   window.entregar = async function(id) { 
       if(await confirmAction('¿Confirmar entrega?')) { window.cambiarEstatus(id, 'entregado'); } 
   };
   
   window.verDetalles = async function(id, f) {
       const r = await fetch(`/api/ordenes/${id}/detalles`); const i = await r.json();
       getEl('listaDetalles').innerHTML = i.map(x => `<li class="list-group-item d-flex justify-content-between px-4 py-3"><div><span class="fw-bold">${x.cantidad}x ${x.servicio}</span><br><small class="text-muted">${x.notas || ''}</small></div><span>$${(x.precio_unitario * x.cantidad).toFixed(2)}</span></li>`).join('');
       getEl('det-folio').innerText = f; getEl('modalDetalles').setAttribute('data-folio', f); getEl('modalDetalles').setAttribute('data-id', id);
       const rOrd = await fetch(`/api/ordenes/${f}/full`); const dOrd = await rOrd.json(); const saldo = dOrd.info.total - dOrd.info.monto_pagado;
       getEl('btnLiquidarContainer').innerHTML = saldo > 0.5 ? `<button class="btn btn-success w-100 py-3" onclick="window.abrirLiquidacion(${id}, ${saldo})">LIQUIDAR ($${saldo.toFixed(2)})</button>` : '';
       if(!getEl('btnEditOrden')) { const b = document.createElement('button'); b.id='btnEditOrden'; b.className='btn btn-warning flex-grow-1 me-2'; b.innerText='✏️ EDITAR'; document.querySelector('#modalDetalles .modal-footer').prepend(b); }
       getEl('btnEditOrden').onclick = () => window.cargarOrdenParaEditar(id, f);
       new bootstrap.Modal(getEl('modalDetalles')).show();
   };
   
   window.cargarOrdenParaEditar = async function(id, folio) {
       try {
           const r = await fetch(`/api/ordenes/${folio}/full`); const data = await r.json(); const orden = data.info; const items = data.items;
           carrito = items.map(i => {
               const prodReal = (cat||[]).find(p => p.nombre === i.servicio);
               return { id: prodReal ? prodReal.id : 99999, n: i.servicio, p: parseFloat(i.precio_unitario), cantidad: i.cantidad, nota: i.notas, detalles: i.detalles_json ? JSON.parse(i.detalles_json) : null };
           });
           currentClient = { id: orden.cliente_id, nombre: orden.cliente, telefono: orden.telefono, direccion_principal: orden.direccion_entrega };
           getEl('selCliName').innerText = orden.cliente; getEl('selectedClient').style.display = 'flex';
           editingOrderId = id; getEl('editModeBanner').style.display = 'block'; getEl('editModeBanner').innerText = `EDITANDO ${folio}`;
           bootstrap.Modal.getInstance(getEl('modalDetalles')).hide(); window.renderCart(); window.nav('pos');
       } catch (e) { Swal.fire('Error', 'No se pudo cargar', 'error'); }
   };
   
   window.abrirLiquidacion = function(id, saldo) { ordenPorLiquidar = { id, saldo }; getEl('liqMonto').innerText = `$${saldo.toFixed(2)}`; new bootstrap.Modal(getEl('modalLiquidar')).show(); };
   window.confirmarLiquidacion = async function(metodo) { if (!ordenPorLiquidar) return; await fetch('/api/ordenes/liquidar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden_id: ordenPorLiquidar.id, monto: ordenPorLiquidar.saldo, metodo_pago: metodo, usuario_id: usuario.id, sucursal_id: sucursalID }) }); bootstrap.Modal.getInstance(getEl('modalLiquidar')).hide(); bootstrap.Modal.getInstance(getEl('modalDetalles')).hide(); Swal.fire('Pagado', '', 'success'); window.loadKanban(); };
   window.cancelarOrdenDesdeModal = async function() { const id = getEl('modalDetalles').getAttribute('data-id'); const { value: m } = await Swal.fire({ title: 'Motivo cancelación', input: 'text', showCancelButton: true }); if (m) { await fetch('/api/ordenes/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, motivo: m }) }); bootstrap.Modal.getInstance(getEl('modalDetalles')).hide(); window.loadKanban(); } };
   
   /* =========================================
      7. CONFIGURACIÓN Y TICKET
      ========================================= */
   window.loadConfig = async function() { 
       if((usuario.rol||'').toLowerCase().trim()!=='admin') return; 
       const r = await fetch(`/api/gestion/config?sucursal_id=${sucursalID}`); 
       const c = await r.json(); 
       if(c) { 
           if(getEl('conf-header')) getEl('conf-header').value = c.ticket_header;
           if(getEl('conf-dir')) getEl('conf-dir').value = c.direccion;
           if(getEl('conf-tel')) getEl('conf-tel').value = c.telefono;
           if(getEl('conf-footer')) getEl('conf-footer').value = c.ticket_footer;
           if(getEl('conf-legal')) getEl('conf-legal').value = c.ticket_legal;
           if(getEl('conf-precio-kilo')) getEl('conf-precio-kilo').value = c.precio_kilo;
           if(getEl('conf-min-kilos')) getEl('conf-min-kilos').value = c.minimo_kilos;
           if(getEl('conf-fondo')) getEl('conf-fondo').value = c.fondo_caja_default;
           if(getEl('conf-dias-abandono')) getEl('conf-dias-abandono').value = c.dias_abandono;
           if(getEl('conf-dias-entrega')) getEl('conf-dias-entrega').value = c.dias_entrega; 
           localStorage.setItem('config_sys', JSON.stringify(c)); 
           DIAS_ENTREGA = parseInt(c.dias_entrega) || 2;
           PRECIO_KILO = parseFloat(c.precio_kilo) || 32;
       } 
   };
   
   window.guardarConfigDB = async function() { 
       const configData = { sucursal_id: sucursalID, ticket_header: getEl('conf-header').value, direccion: getEl('conf-dir').value, telefono: getEl('conf-tel').value, ticket_footer: getEl('conf-footer').value, ticket_legal: getEl('conf-legal').value, precio_kilo: getEl('conf-precio-kilo').value, minimo_kilos: getEl('conf-min-kilos').value, fondo_caja_default: getEl('conf-fondo').value, dias_abandono: getEl('conf-dias-abandono').value, dias_entrega: getEl('conf-dias-entrega').value }; 
       try { 
           await fetch('/api/gestion/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(configData) }); 
           localStorage.setItem('config_sys', JSON.stringify(configData));
           DIAS_ENTREGA = parseInt(configData.dias_entrega) || 2;
           Swal.fire('Guardado', 'Configuración actualizada', 'success'); 
       } catch(e) { console.error(e); } 
   };
   
   window.imprimirTicketWeb = async function(folio) {
        try {
            let tc = {};
            try { const rConf = await fetch(`/api/gestion/config?sucursal_id=${sucursalID}`); tc = await rConf.json(); } catch(e) { tc = JSON.parse(localStorage.getItem('config_sys') || '{}'); }
            
            const header = tc.ticket_header || 'LAVANDERÍA'; 
            const address = tc.direccion || ''; 
            const phone = tc.telefono || ''; 
            const footer = tc.ticket_footer || 'Gracias'; 
            const legal = tc.ticket_legal || '.'; 
            
            // Obtenemos los datos de la orden
            const rOrder = await fetch(`/api/ordenes/${folio}/full`); 
            const data = await rOrder.json(); 
            const o = data.info; 
            const items = data.items;
            
            const total = parseFloat(o.total); 
            const pagado = parseFloat(o.monto_pagado); 
            const saldo = total - pagado;

            // --- CORRECCIÓN DE FECHA DE ENTREGA ---
            let fechaEntregaEst;
            
            if (o.fecha_entrega) {
                // SI HAY FECHA EN DB (CALENDARIO), USARLA
                // Creamos la fecha y le sumamos horas para evitar que la zona horaria la regrese un día
                const fDB = new Date(o.fecha_entrega);
                fDB.setHours(fDB.getHours() + 12); 
                fechaEntregaEst = fDB.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
            } else {
                // SI NO (Orden vieja), USAR CONFIGURACIÓN
                const diasE = parseInt(tc.dias_entrega) || 2;
                const fechaObj = new Date(); 
                fechaObj.setDate(fechaObj.getDate() + diasE);
                fechaEntregaEst = fechaObj.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
            }
            // --------------------------------------
            
            const html = `
                <div class="ticket-page" style="width:58mm; margin:0 auto; padding-bottom: 20px; page-break-after: always; font-family: monospace;">
                    <div style="text-align:center; margin-bottom:10px;"><b style="font-size:16px;">${header}</b><br>${address}<br>Tel: ${phone}<br>${new Date().toLocaleString('es-MX', {timeZone:'America/Mexico_City', hour12:true})}</div>
                    <div style="border-bottom:1px dashed #000; margin:5px 0;"></div>
                    <div style="display:flex; justify-content:space-between;"><span>FOLIO:</span><b>#${o.folio}</b></div>
                    <div>CLIENTE: <b>${o.cliente.substring(0, 20)}</b></div>
                    
                    <div style="margin: 10px 0; border: 1px solid #000; padding: 5px; text-align: center; font-weight: bold; font-size: 14px;">ENTREGA ESTIMADA:<br>${fechaEntregaEst.toUpperCase()}</div>
                    
                    <div style="border-bottom:1px dashed #000; margin:5px 0;"></div>
                    ${items.map(i => `<div style="display:flex; justify-content:space-between; margin-bottom:3px;"> <span style="width:15%; font-weight:bold;">${i.cantidad}</span> <span style="width:60%;">${i.servicio}</span> <span style="width:25%; text-align:right;">$${(i.cantidad * parseFloat(i.precio_unitario)).toFixed(2)}</span> </div>`).join('')}
                    <div style="border-bottom:1px dashed #000; margin:5px 0;"></div>
                    <div style="text-align:right; font-size:14px; font-weight:bold;">TOTAL: $${total.toFixed(2)}</div>
                    <div style="text-align:right; font-size:12px;">Abonado: $${pagado.toFixed(2)}</div>
                    <div style="text-align:center; margin:10px 0; padding:5px; font-weight:bold; ${saldo<1?'border:2px solid black':'background:black;color:white'}">${saldo<1?'★ PAGADO ★':`RESTA: $${saldo.toFixed(2)}`}</div>
                    <div style="font-size:10px; text-align:justify; margin-top:5px;">${legal}</div>
                    <div style="text-align:center; margin-top:10px; font-style:italic;">${footer}</div>
                    <div style="text-align:center;">.</div>
                </div>`;
            
            getEl('printableTicket').innerHTML = html + html; 
            setTimeout(() => { window.print(); }, 800);
        } catch (e) { console.error(e); }
    };
   window.imprimirTicketDesdeModal = function() { const f = getEl('modalDetalles').getAttribute('data-folio'); if(f) window.imprimirTicketWeb(f); };
   
   /* =========================================
      8. UTILIDADES
      ========================================= */
   async function cargarSelectorSucursales() { const cont = getEl('sucursal-selector-container'); if(!cont) return; const r=await fetch('/api/gestion/sucursales'); const s=await r.json(); if((usuario.rol||'').toLowerCase().trim()==='admin'){ getEl('selSucursal').innerHTML=s.map(x=>`<option value="${x.id}" ${x.id==sucursalID?'selected':''}>${x.nombre}</option>`).join(''); cont.style.display='block'; } }
   function cambiarSucursal(id) { localStorage.setItem('sucursal_activa', id); location.reload(); }
   async function confirmAction(msg = '¿Seguro?') { const r = await Swal.fire({ title: msg, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' }); return r.isConfirmed; }
   function getRegimenDesc(code) { const f = REGIMENES.find(x => x.c === code); return f ? f.d : code; }
   function getUsoDesc(code) { const f = USOS_CFDI.find(x => x.c === code); return f ? f.d : code; }
   
   window.delProd = async function(id) { if(await confirmAction('¿Eliminar?')) { await fetch('/api/gestion/inventario/borrar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) }); window.loadInv(); } };
   window.modalSucursal = async function(s = null) { const { value: f } = await Swal.fire({ title: s ? 'Editar' : 'Nueva', html: `<input id="sn" class="swal2-input" value="${s ? s.nombre : ''}" placeholder="Nombre"><input id="sp" class="swal2-input" value="${s ? s.prefijo : ''}" placeholder="Prefijo">`, preConfirm: () => { return { id: s ? s.id : null, nombre: getEl('sn').value, prefijo: getEl('sp').value, direccion: '', telefono: '' } } }); if (f) { await fetch('/api/gestion/sucursales/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); window.loadSucursalesTable(); } }
   window.loadSucursalesTable = async function() { const r = await fetch('/api/gestion/sucursales'); const d = await r.json(); getEl('tblSucursales').innerHTML = d.map(s => `<tr><td>${s.nombre}</td><td>${s.prefijo}</td><td><button class="btn btn-sm btn-primary" onclick='window.modalSucursal(${JSON.stringify(s)})'>✏️</button></td></tr>`).join(''); }
   window.modalUser = async function() { const { value: f } = await Swal.fire({ title: 'Nuevo', html: '<input id="un" class="swal2-input" placeholder="Nombre"><input id="uu" class="swal2-input" placeholder="Usuario"><input id="up" type="password" class="swal2-input" placeholder="Pass"><select id="ur" class="swal2-input"><option value="cajero">Cajero</option><option value="admin">Admin</option></select>', preConfirm: () => ({ nombre: getEl('un').value, usuario: getEl('uu').value, password: getEl('up').value, rol: getEl('ur').value, sucursal_id: sucursalID }) }); 
       if (f) { 
           const r = await fetch('/api/gestion/usuarios/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); 
           if(!r.ok) return Swal.fire('Error', 'No se pudo crear (Usuario duplicado?)', 'error');
           window.loadUsers(); 
       } 
   };
   window.loadUsers = async function() { const r = await fetch('/api/gestion/usuarios'); const u = await r.json(); getEl('tblUsers').innerHTML = u.map(x => `<tr><td>${x.nombre}</td><td>${x.rol}</td><td><button class="btn btn-sm btn-outline-danger" onclick="window.delUser(${x.id})">Borrar</button></td></tr>`).join(''); }
   window.delUser = async function(id) { if (await confirmAction()) { await fetch('/api/gestion/usuarios/borrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); window.loadUsers(); } }
   window.loadAuditoria = async function() { try { const r = await fetch(`/api/gestion/auditoria?sucursal_id=${sucursalID}`); const d = await r.json(); const tbl = getEl('tblAudit'); if (!d || d.length === 0) { tbl.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-muted">No hay registros</td></tr>'; return; } tbl.innerHTML = d.map(a => `<tr><td><small>${a.fecha.split('T')[0]}</small></td><td><b>${a.usuario}</b></td><td>${a.accion}</td><td>${a.detalle||''}</td></tr>`).join(''); } catch(e) {} }
   window.saveLocalPrint = function() { localStorage.setItem('pc', JSON.stringify({ f: getEl('local-font').value, w: getEl('conf-ancho').value })); };
   
   // --- CARGA DE REPORTE Y PDF (CORREGIDOS Y RESTAURADOS) ---
    window.loadReport360 = async function() { 
        try { 
            let i = getEl('rep-ini').value, f = getEl('rep-fin').value; 
            if(!i) { i = new Date().toISOString().slice(0,10); getEl('rep-ini').value = i; }
            if(!f) { f = new Date().toISOString().slice(0,10); getEl('rep-fin').value = f; }
            
            // Obtenemos los datos
            const r = await fetch(`/api/ordenes/reporte-completo?sucursal_id=${sucursalID}&inicio=${i}&fin=${f}`); 
            const d = await r.json(); 
            
            reportData = { list_ing: d.movimientos.ingresos || [], balance: d.balance || {}, fechas: { inicio: i, fin: f } };
            
            // Actualizamos los KPIs superiores
            safeText('kpi-ingresos', money(d.balance.ingresos_totales)); 
            safeText('kpi-gastos', money(d.balance.egresos_totales)); 
            safeText('kpi-caja', money(d.balance.caja_teorica)); 
            
            // --- AQUÍ ESTÁ LA ACTUALIZACIÓN DE LA TABLA (7 COLUMNAS) ---
            getEl('tbl-reporte-360').innerHTML = d.movimientos.ingresos.map(o => {
                // 1. Formatear la fecha (quitar la hora)
                const fechaFmt = o.fecha ? o.fecha.split('T')[0] : '--';
                
                // 2. Lógica visual para la deuda (Rojo si debe, Verde si pagó)
                const deuda = parseFloat(o.deuda_actual || 0);
                const deudaHtml = deuda > 0.5 
                    ? `<span class="text-danger fw-bold">${money(deuda)}</span>` 
                    : `<span class="text-success small fw-bold">PAGADO</span>`;

                // 3. Renderizar las 7 celdas alineadas con tu encabezado HTML
                return `<tr>
                    <td><small>${fechaFmt}</small></td>                    <td class="fw-bold">${o.folio}</td>                     <td>${o.cliente}</td>                                   <td><span class="badge bg-light text-dark border">${o.metodo_pago}</span></td> <td class="text-end text-muted">${money(o.total_orden || 0)}</td> <td class="text-end fw-bold text-primary">${money(o.abono)}</td>  <td class="text-end">${deudaHtml}</td>                  </tr>`;
            }).join(''); 
            // ------------------------------------------------------------

        } catch (e) { console.error("Error reporte:", e); } 
    };
   
   async function loadHistorial() { const ini = getEl('h-ini').value; const fin = getEl('h-fin').value; const r = await fetch(`/api/ordenes/listado?sucursal_id=${sucursalID}`); const d = await r.json(); const f = d.filter(o => o.fecha_creacion.split('T')[0] >= ini); getEl('tblHistorial').innerHTML = f.map(o => `<tr><td>${o.folio}</td><td>${o.cliente}</td><td>${money(o.total)}</td><td>${o.estatus}</td><td class="text-end"><button class="btn btn-sm btn-primary" onclick="window.verDetalles(${o.id}, '${o.folio}')">Ver</button></td></tr>`).join(''); }
   window.loadInv = async function() { try { const r = await fetch(`/api/gestion/inventario?sucursal_id=${sucursalID}`); cat = await r.json(); window.filt(); const tbl = document.getElementById('tblInv'); if(tbl) tbl.innerHTML = cat.map(p => `<tr><td>${p.nombre}</td><td>${p.tipo}</td><td>$${p.precio}</td><td>${p.stock}</td><td class="text-end"><button class="btn btn-sm btn-primary" onclick="window.modalProd(${p.id})">✏️</button><button class="btn btn-sm btn-outline-danger" onclick="window.delProd(${p.id})">🗑️</button></td></tr>`).join(''); } catch(e) {} };
   async function gasto() { const {value:v}=await Swal.fire({title:'Gasto', html:'<input id="d" class="swal2-input" placeholder="Desc"><input id="m" type="number" class="swal2-input" placeholder="$">', preConfirm:()=>[getEl('d').value, getEl('m').value]}); if(v) await fetch('/api/finanzas/gasto',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({descripcion:v[0], monto:v[1], sucursal_id:sucursalID, usuario_id:usuario.id})}); }
   window.exportContadoraPDF = async function() {
    try {
        const i = document.getElementById('rep-ini').value;
        const f = document.getElementById('rep-fin').value;
        const sucursalID = localStorage.getItem('sucursal_activa') || 1; // Asegurar ID

        // 1. Llamamos a la nueva ruta detallada
        const r = await fetch(`/api/finanzas/reporte-sat-detallado?sucursal_id=${sucursalID}&inicio=${i}&fin=${f}`);
        const data = await r.json();

        if (!data || data.length === 0) {
            return Swal.fire('Sin datos', 'No hay ventas en este periodo para generar el reporte.', 'info');
        }

        const { jsPDF } = window.jspdf;
        // 'l' = landscape (horizontal) para que quepan todas las columnas
        const doc = new jsPDF('l', 'mm', 'a4'); 

        // Título del reporte
        doc.setFontSize(14);
        doc.text("Reporte de Ventas Facturables (SAT)", 14, 15);
        doc.setFontSize(10);
        doc.text(`Periodo: ${i} al ${f} | Sucursal: ${sucursalID}`, 14, 22);

        // Configuración de la tabla idéntica a tu captura
        doc.autoTable({
            startY: 25,
            head: [[
                'Fecha', 'Folio', 'Razón Social', 'RFC', 'Régimen', 'CP', 'Uso', 
                'Detalle Productos', 'Pago', 'Sub', 'IVA', 'Total'
            ]],
            body: data.map(d => [
                d.fecha,
                d.folio,
                d.razon_social,
                d.rfc,
                d.regimen_fiscal, // Muestra el código (ej. 621)
                d.cp,
                d.uso_cfdi,       // Muestra el código (ej. G03)
                d.detalle_productos, // Aquí va el texto concatenado (1x Lavado...)
                d.pago,
                `$${parseFloat(d.subtotal || 0).toFixed(2)}`,
                `$${parseFloat(d.iva || 0).toFixed(2)}`,
                `$${parseFloat(d.total || 0).toFixed(2)}`
            ]),
            styles: { 
                fontSize: 7, // Letra pequeña para que quepa todo
                cellPadding: 2,
                overflow: 'linebreak' // Permite saltos de línea en "Detalle Productos"
            },
            headStyles: {
                fillColor: [59, 130, 246], // Azul tipo Bootstrap Primary
                textColor: 255,
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 15 }, // Fecha
                1: { cellWidth: 18 }, // Folio
                2: { cellWidth: 25 }, // Razón Social
                3: { cellWidth: 22 }, // RFC
                4: { cellWidth: 25 }, // Régimen
                5: { cellWidth: 12 }, // CP
                6: { cellWidth: 12 }, // Uso
                7: { cellWidth: 'auto' }, // Detalle (el que más espacio necesita)
                8: { cellWidth: 15 }, // Pago
                9: { cellWidth: 15 }, // Sub
                10: { cellWidth: 12 }, // IVA
                11: { cellWidth: 18 }  // Total
            }
        });

        doc.save(`Reporte_SAT_${i}_${f}.pdf`);

    } catch(e) { 
        console.error(e);
        Swal.fire('Error', 'No se pudo generar el PDF. Revisa la consola.', 'error');
    } 
};
   // --- PDF PROFESIONAL RESTAURADO ---
   window.exportSmartPDF = async function() { 
       if(!reportData.list_ing || reportData.list_ing.length === 0) return Swal.fire('Info', 'No hay datos cargados', 'info');
       
       const { jsPDF } = window.jspdf; 
       const doc = new jsPDF('l'); 
       
       const colPrimario = [26, 29, 33]; 
       const colAcento = [59, 130, 246]; 
       const colFondo = [245, 247, 250]; 
       
       doc.setFillColor(...colPrimario); 
       doc.rect(0, 0, 297, 35, 'F'); 
       doc.setTextColor(255, 255, 255); 
       doc.setFontSize(24); doc.setFont("helvetica", "bold"); 
       doc.text("REPORTE FINANCIERO", 14, 20); 
       
       doc.setFontSize(10); doc.setFont("helvetica", "normal"); 
       doc.text(`Generado: ${new Date().toLocaleString()}`, 280, 15, { align: 'right' }); 
       doc.text(`Periodo: ${reportData.fechas.inicio} al ${reportData.fechas.fin}`, 280, 25, { align: 'right' }); 
       
       let yStart = 45; 
       
       // KPIs Visuales
       doc.setDrawColor(200); doc.setFillColor(255, 255, 255); doc.roundedRect(14, yStart, 130, 35, 3, 3, 'FD'); 
       doc.setTextColor(100); doc.setFontSize(10); doc.text("TOTAL INGRESOS", 20, yStart + 10); 
       doc.setTextColor(...colAcento); doc.setFontSize(16); doc.setFont("helvetica", "bold"); 
       doc.text(money(reportData.balance.ingresos_totales), 20, yStart + 22); 
       
       doc.setTextColor(100); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("GASTOS", 70, yStart + 10); 
       doc.setTextColor(220, 53, 69); doc.setFontSize(16); doc.setFont("helvetica", "bold"); 
       doc.text(money(reportData.balance.egresos_totales), 70, yStart + 22); 
       
       doc.setTextColor(100); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("UTILIDAD", 115, yStart + 10); 
       doc.setTextColor(25, 135, 84); doc.setFontSize(16); doc.setFont("helvetica", "bold"); 
       doc.text(money(reportData.balance.utilidad), 115, yStart + 22); 
       
       // Desglose
       doc.setDrawColor(200); doc.setFillColor(255, 255, 255); doc.roundedRect(150, yStart, 133, 35, 3, 3, 'FD'); 
       const desglose = reportData.balance.desglose || { efectivo: 0, tarjeta: 0, transferencia: 0 }; 
       
       doc.setTextColor(100); doc.setFontSize(9); doc.setFont("helvetica", "normal"); 
       doc.text("EFECTIVO", 155, yStart + 10); 
       doc.setTextColor(50); doc.setFontSize(12); doc.setFont("helvetica", "bold"); 
       doc.text(money(desglose.efectivo), 155, yStart + 20); 
       
       doc.setTextColor(100); doc.setFontSize(9); doc.setFont("helvetica", "normal"); 
       doc.text("TARJETA", 195, yStart + 10); 
       doc.setTextColor(50); doc.setFontSize(12); doc.setFont("helvetica", "bold"); 
       doc.text(money(desglose.tarjeta), 195, yStart + 20); 
       
       doc.setTextColor(100); doc.setFontSize(9); doc.setFont("helvetica", "normal"); 
       doc.text("TRANSF.", 235, yStart + 10); 
       doc.setTextColor(50); doc.setFontSize(12); doc.setFont("helvetica", "bold"); 
       doc.text(money(desglose.transferencia), 235, yStart + 20); 
       
       doc.autoTable({ 
           startY: yStart + 45, 
           head: [['Fecha', 'Folio', 'Cliente', 'Método', 'Total Nota', 'Abonado', 'Estado']], 
           body: reportData.list_ing.map(o => [
               o.fecha ? o.fecha.split('T')[0] : 'Hoy', 
               o.folio, 
               o.cliente, 
               o.metodo_pago, 
               `$${parseFloat(o.total_orden||o.monto).toFixed(2)}`, 
               `$${parseFloat(o.abono||o.monto).toFixed(2)}`, 
               (parseFloat(o.deuda_actual||0) > 1) ? `DEBE $${parseFloat(o.deuda_actual).toFixed(2)}` : 'PAGADO'
           ]), 
           theme: 'striped', 
           headStyles: { fillColor: colPrimario, textColor: 255, fontStyle: 'bold' }, 
           styles: { fontSize: 9, cellPadding: 3 }, 
           alternateRowStyles: { fillColor: colFondo } 
       }); 
       
       doc.save(`Reporte_Financiero_${reportData.fechas.inicio}.pdf`); 
   };
   
   // ARQUEOS Y TURNOS
   window.checkTurno = async function() { 
       try {
           const r = await fetch(`/api/gestion/turno/activo?sucursal_id=${sucursalID}&usuario_id=${usuario.id}`); 
           const d = await r.json(); 
           const el = getEl('turnoStatus'); 
           if (d && d.id) { 
               el.className = 'p-2 rounded-2 bg-success text-white text-center small fw-bold pointer'; 
               el.innerText = '🟢 ABIERTO'; 
               el.onclick = () => window.nav('rep360'); 
           } else { 
               el.className = 'p-2 rounded-2 bg-danger text-white text-center small fw-bold pointer'; 
               el.innerText = '🔴 CERRADO'; 
               el.onclick = () => window.gestionarTurno(); 
           }
       } catch(e) {}
   };
   window.gestionarTurno = async function() { 
       const { value: f } = await Swal.fire({ title: 'Apertura', input: 'number', inputValue: 500 }); 
       if (f) { await fetch('/api/gestion/turno/abrir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sucursal_id: sucursalID, usuario_id: usuario.id, fondo: f }) }); window.checkTurno(); } 
   };
   window.hacerCorteZ = async function() {
       const rPre = await fetch(`/api/gestion/corte/preliminar?sucursal_id=${sucursalID}`);
       const pre = await rPre.json();
       const { value: contado } = await Swal.fire({ title: '🔐 Cierre de Turno Z', html: `<p>Esperado en Caja: <b>$${pre.esperado_en_caja}</b></p><input id="z-real" type="number" class="swal2-input" placeholder="Dinero Real en Caja">`, preConfirm: () => getEl('z-real').value });
       if (contado) {
           const rCierre = await fetch('/api/gestion/corte/cerrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sucursal_id: sucursalID, usuario_id: usuario.id, monto_reportado: contado }) });
           const d = await rCierre.json();
           if (d.success) { Swal.fire('Turno Cerrado', `Nuevo Fondo: $${d.resumen.nuevo_fondo}`, 'success').then(() => location.reload()); }
       }
   };
   
   // VISTA CHOFER (FILTRO CORREGIDO CON ID NUEVO)
   window.loadChoferView = async function() { 
       const c = getEl('choferCards'); if(!c) return; c.innerHTML = '<div class="text-center p-5 text-muted">Cargando ruta...</div>'; 
       const fechaFiltro = getEl('choferFecha') ? getEl('choferFecha').value : new Date().toISOString().slice(0,10);
       // LEER EL SELECTOR NUEVO
       const elFiltro = getEl('choferFiltroEstado');
       const estadoFiltro = elFiltro ? elFiltro.value : 'pendientes';
   
       try { 
           const r = await fetch(`/api/ordenes/listado?sucursal_id=${sucursalID}`); 
           const data = await r.json(); 
           
           const entregas = data.filter(o => {
               const esDomicilio = o.tipo_entrega === 'domicilio' || (o.cliente && o.cliente.toLowerCase().includes('domicilio'));
               if(!esDomicilio) return false;
   
               const esPendiente = o.estatus !== 'entregado' && o.estatus !== 'cancelada';
               const esEntregado = o.estatus === 'entregado';
               const coincideFecha = o.fecha_creacion.startsWith(fechaFiltro);
   
               if(estadoFiltro === 'pendientes') return esPendiente; // Muestra TODO lo que no se ha entregado (sin importar fecha)
               if(estadoFiltro === 'entregados') return esEntregado && coincideFecha; // Solo entregados de la fecha
               return esPendiente || (esEntregado && coincideFecha); // Todos
           });
           
           if(entregas.length === 0) { c.innerHTML = '<div class="text-center p-5 text-muted">No hay entregas para mostrar.</div>'; return; } 
           
           c.innerHTML = entregas.map(o => { 
               const badgeColor = o.estatus === 'listo' ? 'bg-success' : (o.estatus === 'entregado' ? 'bg-secondary' : 'bg-warning text-dark'); 
               const direccion = o.direccion_entrega || o.direccion_principal || 'Dirección no especificada'; 
               const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`; 
               const wLink = o.telefono ? `https://wa.me/52${o.telefono.replace(/\D/g,'')}?text=${encodeURIComponent('Hola, vamos en camino con tu pedido ' + o.folio)}` : '#';
               
               // Botón de acción: Si ya está entregado, no mostrar botón verde
               const btnAccion = o.estatus !== 'entregado' 
                   ? `<button class="btn btn-success flex-fill fw-bold" onclick="window.cambiarEstatus(${o.id}, 'entregado')">Entregado</button>` 
                   : `<button class="btn btn-secondary flex-fill fw-bold" disabled>Entregado ✅</button>`;
   
               return `
               <div class="delivery-card mb-3 shadow-sm border rounded bg-white">
                   <div class="delivery-header p-3 border-bottom d-flex justify-content-between align-items-center bg-light">
                       <div><span class="badge bg-primary">#${o.folio}</span> <span class="fw-bold ms-2">${o.cliente}</span></div>
                       <span class="badge ${badgeColor}">${o.estatus.toUpperCase()}</span>
                   </div>
                   <div class="delivery-body p-3">
                       <div class="d-flex align-items-start gap-3">
                           <i class="bi bi-geo-alt-fill text-danger fs-3"></i>
                           <div>
                               <h6 class="fw-bold mb-1">Dirección de Entrega</h6>
                               <p class="text-muted small mb-0">${direccion}</p>
                               <small class="text-primary fw-bold">${money(o.saldo > 0 ? o.saldo : 0)} por cobrar</small>
                           </div>
                       </div>
                   </div>
                   <div class="delivery-actions p-2 d-flex gap-2 border-top bg-light">
                       <a href="tel:${o.telefono}" class="btn btn-light flex-fill border"><i class="bi bi-telephone-fill text-primary"></i> Llamar</a>
                       <a href="${mapLink}" target="_blank" class="btn btn-light flex-fill border"><i class="bi bi-map-fill text-danger"></i> Mapa</a>
                       <a href="${wLink}" target="_blank" class="btn btn-light flex-fill border"><i class="bi bi-whatsapp text-success"></i> Avisar</a>
                       ${btnAccion}
                   </div>
               </div>`; 
           }).join(''); 
       } catch(e) { c.innerHTML = '<div class="text-center text-danger p-5">Error cargando ruta</div>'; } 
   };
   
   /* =========================================
      9. INICIALIZACIÓN (AL FINAL)
      ========================================= */
   if(usuario) {
       document.addEventListener('DOMContentLoaded', () => {
           // Inicializar UI
           modalProdBS = new bootstrap.Modal(getEl('modalProd'), {backdrop: 'static'}); 
           const localISO = new Date().toISOString().slice(0, 10);
           ['h-ini','h-fin','rep-ini','rep-fin','choferFecha'].forEach(id => { if(getEl(id)) getEl(id).value = localISO; });
   
           const rolLimpio = (usuario.rol || '').toLowerCase().trim();
           if(getEl('uName')) getEl('uName').innerText = usuario.nombre;
           if(getEl('avT')) getEl('avT').innerText = usuario.nombre.charAt(0).toUpperCase();
           if(getEl('uRole')) getEl('uRole').innerText = rolLimpio.toUpperCase();
           if (rolLimpio !== 'admin') document.querySelectorAll('.admin-only').forEach(e => e.classList.add('d-none'));
   
           // Cargas
           window.cargarSelectorSucursales();
           window.checkTurno();
           window.loadConfig(); 
           window.loadInv();
   
           const savedCart = localStorage.getItem('pos_cart');
           if (savedCart) { carrito = JSON.parse(savedCart); window.renderCart(); }
   
           window.nav('pos');
       });
   }