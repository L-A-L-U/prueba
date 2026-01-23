/* =========================================
   1. VARIABLES Y CONFIGURACIÓN INICIAL
   ========================================= */
   let usuario = null;

    const Swal = window.Swal.mixin({
        showCloseButton: true,  // <--- ¡ESTA ES LA CLAVE! Pone la X en la esquina
        allowEscapeKey: true,   // Permite cerrar con la tecla ESC
        allowOutsideClick: true // Permite cerrar clicando fuera (opcional)
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
           // Forzamos la variable local para que no haya errores
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
   // --- REEMPLAZAR window.nav EN public/app.js ---

    window.nav = function(view) {
        // 1. Ocultar todas las vistas y mostrar la elegida
        document.querySelectorAll('.view').forEach(e => e.classList.remove('active'));
        const viewEl = document.getElementById('v-' + view);
        if(viewEl) viewEl.classList.add('active');
        
        // 2. Cerrar menú en móvil
        if(window.innerWidth < 900) {
            const side = document.querySelector('.sidebar');
            if(side) side.classList.remove('show');
        }

        // 3. Cargas dinámicas (El cerebro de cada sección)
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

        // DENTRO DE window.nav, al final de los ifs:

        if(view === 'search') {
            const inp = getEl('inputBusquedaFolio');
            const res = getEl('search-result');
            if(res) res.style.display = 'none';
            if(inp) { inp.value = ''; setTimeout(() => inp.focus(), 300); }
        }

        // --- AQUÍ ESTÁ LO NUEVO PARA LA BÚSQUEDA ---
        if(view === 'search') {
            // Limpiamos la búsqueda anterior para que se vea limpio
            const inp = document.getElementById('inputBusquedaFolio');
            const res = document.getElementById('search-result');
            
            if(res) res.style.display = 'none'; // Ocultar resultados viejos
            if(inp) { 
                inp.value = ''; // Limpiar texto
                setTimeout(() => inp.focus(), 300); // Poner cursor listo para escribir
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
   
    // --- PEGAR EN public/app.js (Reemplazando las funciones anteriores de Tintorería) ---

    let massList = []; 
    let massProductBase = null;

    // --- REEMPLAZAR EN public/app.js ---
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
                        // --- CORRECCIÓN DE SEGURIDAD ---
                        ['tm-qty','tm-prenda','tm-color','tm-detalles'].forEach(id => {
                            const el = document.getElementById(id);
                            if(el) el.addEventListener('keypress', (e) => { if(e.key==='Enter') window.addMassItem(); });
                        });
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

        // Agregamos a la lista temporal (Aquí no agrupamos, para que el usuario vea lo que hace)
        massList.push({ 
            cantidad: qty, 
            prenda, 
            color: color || 'Sin color', 
            marca: detalles || '', 
            detalles 
        });

        window.renderMassTable();

        // Limpieza inteligente (Dejamos el cursor en prenda para seguir rápido)
        getEl('tm-qty').value = 1;
        getEl('tm-prenda').value = '';
        getEl('tm-color').value = '';
        getEl('tm-detalles').value = '';
        getEl('tm-prenda').focus();
    };

    window.renderMassTable = function() {
        const tbody = getEl('tm-lista');
        let totalItems = 0;
        
        tbody.innerHTML = massList.map((item, index) => {
            totalItems += item.cantidad;
            return `
            <tr>
                <td class="text-center fw-bold text-primary fs-6">${item.cantidad}</td>
                <td class="fw-bold">${item.prenda}</td>
                <td>${item.color}</td>
                <td class="text-end"><i class="bi bi-x-circle text-danger pointer" onclick="window.removeMassItem(${index})"></i></td>
            </tr>`;
        }).join('');
        
        getEl('tm-count').innerText = totalItems;
        
        // Auto-scroll
        tbody.parentElement.parentElement.scrollTop = tbody.parentElement.parentElement.scrollHeight;
    };

    window.removeMassItem = function(index) {
        massList.splice(index, 1);
        window.renderMassTable();
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
    // --- REEMPLAZAR EN public/app.js ---

    window.cobrar = async function() { 
        if(carrito.length===0) return notificar('warning','Vacío');

        if(!turnoActivo) {
            return Swal.fire({
                icon: 'error', 
                title: '¡Caja Cerrada!', 
                text: 'Debes abrir turno antes de cobrar.',
                confirmButtonText: 'Abrir ahora',
                preConfirm: () => window.abrirTurnoUI()
            });
        }
        
        const total = carrito.reduce((a,b)=>a+(parseFloat(b.p||b.precio)*b.cantidad),0);
        
        await Swal.fire({ 
            title: 'Total a Pagar', // Agregué título para que la X se alinee mejor
            html: getEl('tplCobro').innerHTML, 
            showConfirmButton: false, 
            showCloseButton: true, // Forzamos la X aquí también
            width: '600px', // Un poco más ancha para que se vea mejor
            didOpen: () => { 
                getEl('lblTotalDisplay').innerText = `$${total.toFixed(2)}`; 
                getEl('lblTotal').innerText = total; 
                
                // FECHA SUGERIDA
                const fechaSugerida = new Date();
                fechaSugerida.setDate(fechaSugerida.getDate() + (window.DIAS_ENTREGA || 2));
                getEl('c-fecha-entrega').value = fechaSugerida.toISOString().slice(0,10);

                getEl('c-hora-entrega').value = '';

                // LIMPIAR INPUTS
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

    /* =========================================================
   BÚSQUEDA CORREGIDA (VERSIÓN DEFINITIVA)
   ========================================================= */
// --- PARCHE DE EMERGENCIA PARA BÚSQUEDA ---
window.buscarOrden = async function() {
    console.log("🚀 EJECUTANDO BÚSQUEDA NUEVA (PARCHEADA)");
    const input = document.getElementById('inputBusquedaFolio');
    const texto = input.value.trim(); 
    
    // 1. SI FALTA EL HTML, LO CREAMOS AL VUELO
    const container = document.getElementById('search-result');
    if (container && !document.getElementById('res-multiple-list')) {
        console.log("🔧 Reparando HTML...");
        container.innerHTML = `
            <div id="res-multiple-view" style="display:none;" class="p-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="fw-bold text-muted m-0">📋 Selecciona:</h6>
                    <button class="btn btn-sm btn-outline-secondary" onclick="this.closest('#search-result').style.display='none'">X</button>
                </div>
                <div id="res-multiple-list" class="list-group"></div>
            </div>
            <div id="res-single-view" style="display:none;"></div>
        `;
    }

    Swal.fire({title: 'Buscando...', didOpen: () => Swal.showLoading()});

    try {
        // Usamos la variable global sucursalID o forzamos 1
        const sId = (typeof sucursalID !== 'undefined') ? sucursalID : 1;
        const r = await fetch(`/api/ordenes/rastreo/${encodeURIComponent(texto)}?sucursal_id=${sId}`);
        const data = await r.json();
        
        Swal.close();

        if (!data.found) return Swal.fire('No encontrado', 'No hay coincidencias', 'warning');

        // MODO LISTA
        if (data.multiple) {
            const divLista = document.getElementById('res-multiple-list');
            divLista.innerHTML = data.resultados.map(o => `
                <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3" 
                        onclick="alert('Has seleccionado el folio: ' + '${o.folio}')">
                    <div>
                        <div class="fw-bold text-primary fs-5">#${o.folio}</div>
                        <div class="fw-bold text-dark">${o.cliente_nombre || o.cliente}</div>
                        <small class="text-muted">${new Date(o.fecha_creacion).toLocaleDateString()}</small>
                    </div>
                    <span class="badge bg-primary">${o.estatus}</span>
                </button>
            `).join('');
            
            document.getElementById('search-result').style.display = 'block';
            document.getElementById('res-multiple-view').style.display = 'block';
            document.getElementById('res-single-view').style.display = 'none';
        } else {
            Swal.fire('Encontrado', `Orden Única: ${data.orden.folio}`, 'success');
        }

    } catch (e) {
        console.error(e);
        Swal.fire('Error', e.message, 'error');
    }
};




// 2. Función auxiliar: Carga detalle al hacer clic en la lista
window.cargarDetalleUnico = async function(folio) {
    Swal.fire({title: 'Cargando...', didOpen: () => Swal.showLoading()});
    try {
        const r = await fetch(`/api/ordenes/rastreo/${folio}?sucursal_id=${sucursalID}`);
        const data = await r.json();
        Swal.close();
        
        if(data.found) {
            getEl('res-multiple-view').style.display = 'none'; // Ocultamos lista
            window.renderizarDetalleOrden(data); // Mostramos detalle
        }
    } catch(e) { Swal.close(); }
};

// 3. Función auxiliar: Pinta la tarjeta de detalle
window.renderizarDetalleOrden = function(data) {
    const o = data.orden;
    const saldo = parseFloat(o.total) - parseFloat(o.monto_pagado);

    getEl('res-single-view').style.display = 'block';
    
    // Textos básicos
    safeText('res-folio', o.folio);
    safeText('res-cliente', o.cliente_nombre || o.cliente);
    safeText('res-fecha', `Recibido: ${new Date(o.fecha_creacion).toLocaleString()}`);
    safeText('res-total', money(o.total));
    safeText('res-pagado', money(o.monto_pagado));
    
    // Etiqueta de saldo
    const elSaldo = getEl('res-saldo');
    if(elSaldo) {
        elSaldo.innerText = saldo > 0.5 ? `PENDIENTE: ${money(saldo)}` : 'LIQUIDADO';
        elSaldo.className = saldo > 0.5 ? 'badge bg-danger' : 'badge bg-success';
    }

    // Lista de prendas
    getEl('res-items').innerHTML = data.items.map(i => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div><span class="fw-bold">${i.cantidad}x ${i.servicio}</span><br><small class="text-muted">${i.notas || ''}</small></div>
            <span class="fw-bold">$${(i.cantidad * parseFloat(i.precio_unitario)).toFixed(2)}</span>
        </li>`).join('');

    // Historial de pagos
    getEl('res-historial-pagos').innerHTML = data.pagos.length ? data.pagos.map(p => `
        <div class="d-flex justify-content-between small border-bottom py-1">
            <span class="text-muted">${new Date(p.fecha).toLocaleDateString()} (${p.metodo_pago})</span>
            <span class="fw-bold text-success">${money(p.monto)}</span>
        </div>`).join('') : '<small class="text-muted">Sin pagos registrados</small>';

    // Línea de tiempo
    if(typeof updateTimeline === 'function') updateTimeline(o.estatus);

    // Info entrega
    const divEnt = getEl('res-delivery-info');
    if(divEnt) {
        if (o.estatus === 'entregado') {
            divEnt.style.display = 'block';
            safeText('res-entregador', data.delivery_info.entregado_por || 'Staff');
            if(o.fecha_real_entrega) safeText('res-fecha-ent', new Date(o.fecha_real_entrega).toLocaleString());
        } else { divEnt.style.display = 'none'; }
    }

    getEl('search-result').style.display = 'block';
};

// AUXILIAR: Carga el detalle cuando haces clic en la lista de múltiples
window.cargarDetalleUnico = async function(folio) {
    Swal.fire({title: 'Cargando...', didOpen: () => Swal.showLoading()});
    try {
        // Reutilizamos la búsqueda, como el folio es exacto, el backend devolverá "multiple: false"
        const r = await fetch(`/api/ordenes/rastreo/${folio}?sucursal_id=${sucursalID}`);
        const data = await r.json();
        Swal.close();
        
        if(data.found && !data.multiple) {
            getEl('res-multiple-view').style.display = 'none'; // Ocultar lista
            window.renderizarDetalleOrden(data); // Mostrar detalle
        }
    } catch(e) { Swal.close(); }
};

    // AUXILIAR: Pinta la tarjeta de detalle (Lo que ya tenías)
    window.renderizarDetalleOrden = function(data) {
        const o = data.orden;
        const saldo = parseFloat(o.total) - parseFloat(o.monto_pagado);

        getEl('res-single-view').style.display = 'block'; // Mostrar contenedor único
        
        safeText('res-folio', o.folio);
        safeText('res-cliente', o.cliente_nombre || o.cliente);
        safeText('res-fecha', `Recibido: ${new Date(o.fecha_creacion).toLocaleString()}`);
        safeText('res-total', money(o.total));
        safeText('res-pagado', money(o.monto_pagado));
        
        const elSaldo = getEl('res-saldo');
        if(elSaldo) {
            elSaldo.innerText = saldo > 0.5 ? `PENDIENTE: ${money(saldo)}` : 'LIQUIDADO';
            elSaldo.className = saldo > 0.5 ? 'text-danger fw-bold' : 'text-success fw-bold';
        }

        getEl('res-items').innerHTML = data.items.map(i => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <div><span class="fw-bold">${i.cantidad}x ${i.servicio}</span><br><small class="text-muted">${i.notas || ''}</small></div>
                <span class="fw-bold">$${(i.cantidad * parseFloat(i.precio_unitario)).toFixed(2)}</span>
            </li>`).join('');

        getEl('res-historial-pagos').innerHTML = data.pagos.length ? data.pagos.map(p => `
            <div class="d-flex justify-content-between small border-bottom py-1">
                <span class="text-muted">${new Date(p.fecha).toLocaleDateString()} (${p.metodo_pago})</span>
                <span class="fw-bold text-success">${money(p.monto)}</span>
            </div>`).join('') : '<small class="text-muted">Sin pagos registrados</small>';

        if(typeof updateTimeline === 'function') updateTimeline(o.estatus);

        const divEnt = getEl('res-delivery-info');
        if(divEnt) {
            if (o.estatus === 'entregado') {
                divEnt.style.display = 'block';
                safeText('res-entregador', data.delivery_info.entregado_por || 'Staff');
                if(o.fecha_real_entrega) safeText('res-fecha-ent', new Date(o.fecha_real_entrega).toLocaleString());
            } else { divEnt.style.display = 'none'; }
        }

        getEl('search-result').style.display = 'block';
    };

    // 2. HELPER PARA LA BARRA DE PROGRESO
    function updateTimeline(estatus) {
        const bar = getEl('res-bar');
        const stText = getEl('res-status-text');
        
        // Reset iconos
        ['lav','lis','ent'].forEach(k => getEl('icon-'+k).className = 'bi bi-circle text-muted');

        let w = '0%';
        let color = 'bg-secondary';
        let texto = 'PENDIENTE';

        if (estatus === 'pendiente') {
            w = '15%'; color = 'alert-secondary';
        } else if (estatus === 'lavando') {
            w = '50%'; color = 'alert-info'; texto = 'EN PROCESO / LAVANDO';
            getEl('icon-lav').className = 'bi bi-water text-info';
        } else if (estatus === 'listo') {
            w = '75%'; color = 'alert-success'; texto = 'LISTO PARA ENTREGA';
            getEl('icon-lav').className = 'bi bi-check-circle-fill text-success';
            getEl('icon-lis').className = 'bi bi-check-circle-fill text-success';
        } else if (estatus === 'entregado') {
            w = '100%'; color = 'alert-dark text-center bg-dark text-white'; texto = 'ENTREGADO AL CLIENTE';
            getEl('icon-lav').className = 'bi bi-check-circle-fill text-success';
            getEl('icon-lis').className = 'bi bi-check-circle-fill text-success';
            getEl('icon-ent').className = 'bi bi-box-seam-fill text-dark';
        } else if (estatus === 'cancelada') {
            w = '100%'; color = 'alert-danger'; texto = 'ORDEN CANCELADA';
            bar.className = 'progress-bar bg-danger';
        }

        bar.style.width = w;
        stText.className = `alert ${color} fw-bold border mt-3 mb-0 text-center`;
        stText.innerText = texto;
    }
    

    let turnoActivo = null; // Variable global para saber si podemos vender

    /* =========================================
   SISTEMA DE CAJA BLINDADA (COMPATIBLE CON NUEVO SERVIDOR)
   ========================================= */

    // 1. CHEQUEO DE ESTADO
    window.checkTurno = async function() { 
        try {
            const btnStatus = document.getElementById('turnoStatus');
            const r = await fetch(`/api/gestion/turno/estado?sucursal_id=${sucursalID}`);
            const d = await r.json();
            
            if(d.abierto) {
                turnoActivo = d.turno; // Guardamos el turno para permitir ventas
                btnStatus.className = 'p-2 rounded-2 bg-success text-white text-center small fw-bold pointer shadow-sm';
                btnStatus.innerHTML = '<i class="bi bi-unlock-fill"></i> CAJA ABIERTA';
                btnStatus.onclick = () => window.cerrarTurnoUI(); 
            } else {
                turnoActivo = null; // Bloqueamos ventas
                btnStatus.className = 'p-2 rounded-2 bg-danger text-white text-center small fw-bold pointer shadow-sm';
                btnStatus.innerHTML = '<i class="bi bi-lock-fill"></i> CAJA CERRADA';
                btnStatus.onclick = () => window.abrirTurnoUI(); 
            }
        } catch(e) { console.error("Error turno:", e); }
    };

    // 2. ABRIR CAJA
    window.abrirTurnoUI = async function() {
        const { value: monto } = await Swal.fire({
            title: '☀️ Apertura de Caja',
            text: '¿Con cuánto dinero (fondo) inicias el turno?',
            icon: 'info',
            input: 'number',
            inputPlaceholder: 'Ej. 500.00',
            confirmButtonText: 'Abrir Caja',
            showCancelButton: true,
            allowOutsideClick: false
        });

        if(monto) {
            // Nota: Enviamos 'monto_inicial' que es lo que espera el nuevo servidor
            const r = await fetch('/api/gestion/turno/abrir', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ sucursal_id: sucursalID, usuario_id: usuario.id, monto_inicial: monto })
            });
            if(r.ok) {
                Swal.fire('¡Éxito!', 'Caja abierta. Ya puedes realizar ventas.', 'success');
                window.checkTurno();
            } else {
                const err = await r.json();
                Swal.fire('Error', err.error || 'No se pudo abrir la caja', 'error');
            }
        }
    };

    // 3. CERRAR CAJA (CORTE 100% CIEGO - SIN MOSTRAR RESULTADOS AL EMPLEADO)
    window.cerrarTurnoUI = async function() {
        // Paso 1: Advertencia
        const { isConfirmed } = await Swal.fire({
            title: '¿Cerrar Turno?',
            text: "Al confirmar, se cerrará la venta y se registrará el monto.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, contar dinero',
            confirmButtonColor: '#d33',
            cancelButtonText: 'Cancelar'
        });

        if(!isConfirmed) return;

        // Paso 2: Conteo Ciego (El cajero solo pone lo que hay físicamente)
        const { value: conteo } = await Swal.fire({
            title: '🔐 Corte de Caja',
            html: `
                <p class="small text-muted">Cuenta todo el efectivo (billetes y monedas) que tienes en el cajón.</p>
                <h3 class="fw-bold">¿Cuánto hay en total?</h3>
                <input id="input-corte" type="number" class="swal2-input" placeholder="$0.00">
            `,
            focusConfirm: false,
            allowOutsideClick: false,
            preConfirm: () => {
                const v = document.getElementById('input-corte').value;
                if(!v) Swal.showValidationMessage('Debes ingresar el monto contado');
                return v;
            }
        });

        if(conteo) {
            // Bloqueamos pantalla mientras procesa
            Swal.fire({ title: 'Procesando cierre...', didOpen: () => Swal.showLoading() });

            try {
                // Enviamos al servidor
                const r = await fetch('/api/gestion/turno/cerrar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ sucursal_id: sucursalID, usuario_id: usuario.id, monto_reportado: conteo })
                });
                const d = await r.json();

                if(d.success) {
                    // --- CAMBIO CLAVE AQUÍ ---
                    // Ya NO mostramos las matemáticas (ni faltantes, ni sobrantes, ni esperado)
                    // Solo confirmamos que se guardó.
                    
                    await Swal.fire({
                        title: 'Turno Cerrado',
                        text: 'El corte se ha registrado correctamente. El administrador revisará el balance.',
                        icon: 'success',
                        confirmButtonText: 'Entendido'
                    });

                    window.checkTurno(); // Actualiza el botón a ROJO (Cerrado)
                    window.location.reload(); // Recarga para limpiar todo y pedir login si es necesario
                } else {
                    Swal.fire('Error', d.error || 'Error al cerrar turno', 'error');
                }
            } catch(e) {
                Swal.fire('Error', 'Fallo de conexión', 'error');
            }
        }
    };

    // Alias para el botón de la configuración
    window.hacerCorteZ = async function() { window.cerrarTurnoUI(); };



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

        const h = document.getElementById('c-hora-entrega');

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
                horario_entrega: getEl('c-hora-entrega').value,
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
            let c='', b=''; 
            
            // BOTONES DE ESTATUS
            if(o.estatus==='pendiente') { 
                c='k-pend'; 
                b=`<button class="btn btn-sm btn-info w-100 text-white fw-bold" onclick="window.cambiarEstatus(${o.id}, 'lavando')">Lavando ➡️</button>`; 
            } 
            else if(o.estatus==='lavando') { 
                c='k-lav'; 
                b=`<button class="btn btn-sm btn-success w-100 fw-bold" onclick="window.cambiarEstatus(${o.id}, 'listo')">Listo ✅</button>`; 
            } 
            else if(o.estatus==='listo') { 
                c='k-list'; 
                // --- CAMBIO AQUÍ: Pasamos el SALDO a la función entregar ---
                b=`<button class="btn btn-sm btn-dark w-100 fw-bold" onclick="window.entregar(${o.id}, ${o.saldo})">Entregar 👋</button>`; 
            } 
            
            if(c) getEl(c).innerHTML += `
                <div class="card p-3 mb-2 shadow-sm border-0" onclick="window.verDetalles(${o.id},'${o.folio}')">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="badge bg-light text-dark border">${o.folio}</span>
                        ${o.saldo>0.5 ? `<span class="badge bg-danger">DEBE ${money(o.saldo)}</span>` : '<span class="badge bg-success">PAGADO</span>'}
                    </div>
                    <div class="fw-bold text-truncate">${o.cliente}</div>
                    <div class="mt-2" onclick="event.stopPropagation()">${b}</div>
                </div>`; 
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
   
    window.entregar = async function(id, saldo) { 
        // 1. REGLA DE ORO: SI DEBE, NO SALE
        if (parseFloat(saldo) > 0.5) {
            Swal.fire({
                icon: 'error',
                title: '¡Tiene Adeudo!',
                html: `Esta orden tiene un saldo pendiente de <b class="text-danger">$${parseFloat(saldo).toFixed(2)}</b>.<br>Debes cobrarla antes de entregar.`,
                confirmButtonText: '💸 Ir a Cobrar',
                confirmButtonColor: '#198754', // Verde
                showCancelButton: true,
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Abrimos directamente la ventana de cobro
                    window.abrirLiquidacion(id, parseFloat(saldo));
                }
            });
            return; // DETENEMOS LA FUNCIÓN AQUÍ
        }

        // 2. Si no debe nada, procedemos normal
        if(await confirmAction('¿Confirmar entrega de prendas?')) {
            window.cambiarEstatus(id, 'entregado'); 
        }
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
   
   // --- PEGAR ESTO EN public/app.js (Reemplazando la window.abrirLiquidacion anterior) ---

window.abrirLiquidacion = function(id, saldo) { 
    ordenPorLiquidar = { id, saldo }; 
    
    // 1. Mostrar el monto de la deuda
    getEl('liqMonto').innerText = `$${saldo.toFixed(2)}`;
    
    // 2. Limpiar la calculadora (Reseteo)
    getEl('liq-recibido').value = ''; 
    getEl('liq-cambio').innerText = '$0.00';
    getEl('liq-cambio').className = 'h4 fw-bold text-muted'; // Color gris inicial

    // 3. Abrir el modal
    new bootstrap.Modal(getEl('modalLiquidar')).show(); 
    
    // 4. Poner el cursor en el input automáticamente para escribir rápido
    setTimeout(() => getEl('liq-recibido').focus(), 500);
};

// --- NUEVA FUNCIÓN MATEMÁTICA ---
    window.calcCambioLiq = function() {
        if (!ordenPorLiquidar) return;
        
        // Obtenemos valores
        const deuda = parseFloat(ordenPorLiquidar.saldo);
        const recibido = parseFloat(getEl('liq-recibido').value);

        // Calculamos cambio
        if (recibido) {
            const cambio = recibido - deuda;
            
            if (cambio >= 0) {
                // Si alcanza
                getEl('liq-cambio').innerText = `$${cambio.toFixed(2)}`;
                getEl('liq-cambio').className = 'h4 fw-bold text-success'; // Verde
            } else {
                // Si falta dinero
                getEl('liq-cambio').innerText = `Falta $${Math.abs(cambio).toFixed(2)}`;
                getEl('liq-cambio').className = 'h4 fw-bold text-danger'; // Rojo
            }
        } else {
            // Si borra el número
            getEl('liq-cambio').innerText = '$0.00';
            getEl('liq-cambio').className = 'h4 fw-bold text-muted';
        }
    };

        // --- FUNCIÓN DE LIQUIDACIÓN BLINDADA (SIN ERRORES DE MODAL) ---
    window.confirmarLiquidacion = async function(metodo) { 
        if (!ordenPorLiquidar) return; 
        
        try {
            // 1. REGISTRAR PAGO EN BASE DE DATOS
            await fetch('/api/ordenes/liquidar', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    orden_id: ordenPorLiquidar.id, 
                    monto: ordenPorLiquidar.saldo, 
                    metodo_pago: metodo, 
                    usuario_id: usuario.id, 
                    sucursal_id: sucursalID 
                }) 
            }); 
            
            // 2. CERRAR MODALES DE FORMA SEGURA (Aquí estaba el error)
            // Usamos un bloque try-catch interno o validamos existencia para que no rompa el flujo
            const elLiq = document.getElementById('modalLiquidar');
            const elDet = document.getElementById('modalDetalles');

            if (elLiq) {
                const modalLiq = bootstrap.Modal.getInstance(elLiq);
                if (modalLiq) modalLiq.hide();
            }

            if (elDet) {
                const modalDet = bootstrap.Modal.getInstance(elDet);
                if (modalDet) modalDet.hide();
            }
            
            // 3. CONFIRMACIÓN Y RECARGA
            Swal.fire('Pagado', 'Deuda liquidada correctamente', 'success'); 
            window.loadKanban(); 
            
            // Si estábamos en la pantalla de búsqueda, intentamos actualizar el detalle
            const divSearch = document.getElementById('search-result');
            if(divSearch && divSearch.style.display === 'block') {
                // Si hay un folio visible, recargamos su detalle
                const folioVisible = document.getElementById('res-folio')?.innerText;
                if(folioVisible && folioVisible !== '---') window.cargarDetalleUnico(folioVisible);
            }

        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Hubo un problema al registrar el pago', 'error');
        }
    };
    // --- CAMBIAR EN public/app.js ---
    // --- PEGAR EN public/app.js ---

    window.cancelarOrdenDesdeModal = async function() { 
        // 1. Identificamos el modal y sus datos
        const modalEl = document.getElementById('modalDetalles');
        const id = modalEl.getAttribute('data-id');
        const bsModal = bootstrap.Modal.getInstance(modalEl);

        // 2. CERRAMOS EL MODAL PRIMERO (Esto elimina el bloqueo del teclado)
        bsModal.hide();

        // 3. Esperamos un instante a que se cierre y lanzamos la pregunta
        setTimeout(async () => {
            const { value: m } = await Swal.fire({ 
                title: '¿Por qué cancelas?', 
                text: 'Esta acción registrará el evento en auditoría.',
                input: 'text', 
                inputPlaceholder: 'Escribe el motivo...',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Sí, Cancelar',
                cancelButtonText: 'Volver'
            }); 
            
            if (m) { 
                // SI ESCRIBIÓ Y CONFIRMÓ:
                try {
                    const r = await fetch('/api/ordenes/cancelar', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify({ id, motivo: m, usuario_id: usuario ? usuario.id : 1 }) 
                    });
                    
                    if(r.ok) {
                        window.loadKanban(); 
                        Swal.fire('Cancelada', 'Orden cancelada correctamente', 'success');
                    } else {
                        Swal.fire('Error', 'No se pudo cancelar', 'error');
                    }
                } catch(e) {
                    Swal.fire('Error', 'Fallo de red', 'error');
                }
            } else { 
                // SI SE ARREPIENTE O CIERRA: Volvemos a abrir el modal original
                bsModal.show();
            }
        }, 300); // Pequeña pausa para que la animación se vea fluida
    };
   
   /* =========================================
      7. CONFIGURACIÓN Y TICKET
      ========================================= */
    // --- REEMPLAZAR ESTAS 2 FUNCIONES EN app.js ---

    window.loadConfig = async function() { 
        // Solo si es admin, y pasamos el ID de sucursal
        if((usuario.rol||'').toLowerCase().trim()!=='admin') return; 
        
        const r = await fetch(`/api/gestion/config?sucursal_id=${sucursalID}`); 
        const c = await r.json(); 
        
        // Llenar los campos (si existen datos)
        if(c) { 
            if(getEl('conf-header')) getEl('conf-header').value = c.ticket_header || '';
            if(getEl('conf-dir')) getEl('conf-dir').value = c.direccion || '';
            if(getEl('conf-tel')) getEl('conf-tel').value = c.telefono || '';
            if(getEl('conf-footer')) getEl('conf-footer').value = c.ticket_footer || '';
            if(getEl('conf-legal')) getEl('conf-legal').value = c.ticket_legal || '';
            
            if(getEl('conf-precio-kilo')) getEl('conf-precio-kilo').value = c.precio_kilo || 32;
            if(getEl('conf-min-kilos')) getEl('conf-min-kilos').value = c.minimo_kilos || 3;
            if(getEl('conf-fondo')) getEl('conf-fondo').value = c.fondo_caja_default || 0;
            if(getEl('conf-dias-abandono')) getEl('conf-dias-abandono').value = c.dias_abandono || 30;
            if(getEl('conf-dias-entrega')) getEl('conf-dias-entrega').value = c.dias_entrega || 2; 
            
            // Actualizamos variables globales
            DIAS_ENTREGA = parseInt(c.dias_entrega) || 2;
            PRECIO_KILO = parseFloat(c.precio_kilo) || 32;
        } 
    };

    // --- PEGAR EN public/app.js ---

    window.guardarConfigDB = async function() { 
        if(!sucursalID) return Swal.fire('Error', 'No se ha detectado la sucursal activa', 'error');

        const configData = { 
            sucursal_id: sucursalID, // Esta variable debe existir globalmente
            ticket_header: getEl('conf-header').value, 
            direccion: getEl('conf-dir').value, 
            telefono: getEl('conf-tel').value, 
            ticket_footer: getEl('conf-footer').value, 
            ticket_legal: getEl('conf-legal').value, 
            precio_kilo: getEl('conf-precio-kilo').value, 
            minimo_kilos: getEl('conf-min-kilos').value, 
            fondo_caja_default: getEl('conf-fondo').value, 
            dias_abandono: getEl('conf-dias-abandono').value, 
            dias_entrega: getEl('conf-dias-entrega').value 
        }; 

        try { 
            const r = await fetch('/api/gestion/config', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(configData) 
            }); 
            
            const res = await r.json();

            if(res.success) {
                DIAS_ENTREGA = parseInt(configData.dias_entrega) || 2;
                Swal.fire('Guardado', 'Configuración guardada correctamente.', 'success'); 
            } else {
                Swal.fire('Error', res.error || 'No se pudo guardar', 'error');
            }
        } catch(e) { 
            console.error(e);
            Swal.fire('Error de Conexión', 'Revisa la terminal del servidor', 'error');
        } 
    };
   
    // --- PEGAR EN public/app.js ---

    // --- EN public/app.js ---

    // --- PEGAR EN public/app.js ---

    // --- PEGAR EN public/app.js ---

    window.imprimirTicketWeb = async function(folio) {
        try {
            if (!folio) { console.error("Intento de imprimir sin folio"); return; }

            // 1. OBTENER CONFIG
            let tc = {};
            try { 
                const rConf = await fetch(`/api/gestion/config?sucursal_id=${sucursalID}`); 
                tc = await rConf.json(); 
            } catch(e) { tc = {}; }
            
            const header = tc.ticket_header || 'LAVANDERÍA'; 
            const address = tc.direccion || ''; 
            const phone = tc.telefono || ''; 
            const footer = tc.ticket_footer || 'Gracias'; 
            const legal = tc.ticket_legal || ''; 
            
            // 2. OBTENER DATOS ORDEN (CON MANEJO DE ERROR 404)
            const rOrder = await fetch(`/api/ordenes/${folio}/full?sucursal_id=${sucursalID}`); 
            
            if (!rOrder.ok) {
                Swal.fire('Atención', 'El ticket no se encontró inmediatamente. Puede que la venta sí se guardó. Búscalo en el historial.', 'warning');
                return;
            }

            const data = await rOrder.json(); 
            if (!data || !data.info) {
                throw new Error("Datos de orden incompletos");
            }

            const o = data.info; 
            const items = data.items || [];
            
            // 3. CÁLCULOS
            const total = parseFloat(o.total || 0); 
            const pagado = parseFloat(o.monto_pagado || 0); 
            const saldo = total - pagado;
            const subtotal = total / 1.16;
            const iva = total - subtotal;

            // 4. FECHAS
            let fechaEntregaEst;
            if (o.fecha_entrega) {
                const fDB = new Date(o.fecha_entrega);
                fDB.setHours(fDB.getHours() + 12); 
                fechaEntregaEst = fDB.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
            } else {
                const diasE = parseInt(tc.dias_entrega) || 2;
                const fechaObj = new Date(); 
                fechaObj.setDate(fechaObj.getDate() + diasE);
                fechaEntregaEst = fechaObj.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
            }
            const horarioTexto = o.horario_entrega ? `(${o.horario_entrega})` : '';
            
            // 5. HTML DEL TICKET (TU DISEÑO NUEVO)
            const html = `
                <div class="ticket-page" style="width:58mm; margin:0 auto; padding-bottom: 20px; page-break-after: always; font-family: 'Helvetica', 'Arial', sans-serif; font-size: 12px; color: #000;">
                    <div style="text-align:center; margin-bottom:10px;">
                        <b style="font-size:16px; text-transform:uppercase;">${header}</b><br>
                        <span style="font-size:10px;">${address}</span><br>
                        ${phone ? `<span style="font-size:10px;">Tel: ${phone}</span><br>` : ''}
                        <span style="font-size:9px;">${new Date().toLocaleString('es-MX', {timeZone:'America/Mexico_City', hour12:true})}</span>
                    </div>
                    <div style="border: 3px solid #000; border-radius: 8px; padding: 8px; margin: 10px 0; text-align: center;">
                        <div style="border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 5px;">
                            <span style="font-size: 10px; font-weight: bold; letter-spacing: 1px;">FOLIO / SERIE</span><br>
                            <span style="font-size: 22px; font-weight: 900; letter-spacing: 1px; display:block; margin-top:2px;">${o.folio}</span>
                        </div>
                        <div style="padding-top: 2px;">
                            <span style="font-size: 10px; font-weight: bold; letter-spacing: 1px;">CLIENTE</span><br>
                            <span style="font-size: 16px; font-weight: 800; text-transform: uppercase; line-height: 1.1; display:block;">${(o.cliente||'').substring(0, 25)}</span>
                        </div>
                    </div>
                    <div style="text-align: center; margin-bottom: 10px;">
                        <span style="font-size:10px; font-weight:bold;">ENTREGA ESTIMADA:</span><br>
                        <span style="font-size: 13px; font-weight: bold;">${fechaEntregaEst.toUpperCase()}</span> 
                        <span style="font-size: 11px;">${horarioTexto}</span>
                    </div>
                    <div style="border-bottom: 2px dashed #000; margin: 5px 0;"></div>
                    <table style="width: 100%; font-size: 11px; margin-bottom: 5px;">
                    ${items.map(i => `
                        <tr style="vertical-align: top;">
                            <td style="width: 10%; font-weight: bold; padding-bottom: 4px;">${i.cantidad}</td>
                            <td style="width: 65%; padding-bottom: 4px;">${i.servicio}</td>
                            <td style="width: 25%; text-align: right; font-weight: bold; padding-bottom: 4px;">$${(i.cantidad * parseFloat(i.precio_unitario)).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                    </table>
                    <div style="border-bottom: 2px dashed #000; margin: 5px 0;"></div>
                    <div style="display:flex; justify-content:space-between; font-size:11px;"><span>SUB:</span><span>$${subtotal.toFixed(2)}</span></div>
                    <div style="display:flex; justify-content:space-between; font-size:11px;"><span>IVA (16%):</span><span>$${iva.toFixed(2)}</span></div>
                    <div style="display:flex; justify-content:space-between; font-weight:900; font-size:18px; margin-top:5px; align-items: center;">
                        <span>TOTAL:</span><span>$${total.toFixed(2)}</span>
                    </div>
                    <div style="text-align:right; font-size:12px; margin-top: 5px;">Abonado: <b>$${pagado.toFixed(2)}</b></div>
                    <div style="text-align:center; margin:10px 0; padding:6px; font-weight:bold; border-radius: 4px; ${saldo<1 ? 'border:2px solid #000;' : 'background:#000; color:#fff;'}">
                        ${saldo < 1 ? '★ PAGADO ★' : `RESTA: $${saldo.toFixed(2)}`}
                    </div>
                    <div style="font-size:9px; text-align:justify; margin-top:10px; line-height: 1.2;">${legal}</div>
                    <div style="text-align:center; margin-top:10px; font-style:italic; font-size:11px; font-weight:bold;">${footer}</div>
                    <div style="text-align:center;">.</div>
                </div>`;
            
            let contenidoFinal = "";
            if (usuario && usuario.rol === 'delivery') {
                contenidoFinal = html; 
            } else {
                contenidoFinal = html + html; 
            }

            getEl('printableTicket').innerHTML = contenidoFinal; 
            setTimeout(() => { window.print(); }, 800);

        } catch (e) { 
            console.error(e); 
            Swal.fire('Error', 'No se pudo generar el ticket visual.', 'error'); 
        }
    };
   window.imprimirTicketDesdeModal = function() { const f = getEl('modalDetalles').getAttribute('data-folio'); if(f) window.imprimirTicketWeb(f); };
   
   /* =========================================
      8. UTILIDADES
      ========================================= */

      /* --- PEGAR ESTO ANTES DE LA SECCIÓN 9. INICIALIZACIÓN --- */

    window.cargarSelectorSucursales = async function() { 
        const cont = document.getElementById('sucursal-selector-container'); 
        if(!cont) return; 
        
        if((usuario.rol||'').toLowerCase().trim() === 'admin'){ 
            try {
                const r = await fetch('/api/gestion/sucursales'); 
                const s = await r.json(); 
                document.getElementById('selSucursal').innerHTML = s.map(x => 
                    `<option value="${x.id}" ${x.id == sucursalID ? 'selected' : ''}>${x.nombre}</option>`
                ).join(''); 
                cont.style.display = 'block'; 
            } catch(e) { console.error(e); }
        } 
    };

    window.cambiarSucursal = function(id) { 
        localStorage.setItem('sucursal_activa', id); 
        location.reload(); 
    };

    window.confirmAction = async function(msg = '¿Seguro?') { 
        const r = await Swal.fire({ 
            title: msg, 
            icon: 'warning', 
            showCancelButton: true, 
            confirmButtonText: 'Sí', 
            cancelButtonText: 'No' 
        }); 
        return r.isConfirmed; 
    };
   async function cargarSelectorSucursales() { const cont = getEl('sucursal-selector-container'); if(!cont) return; const r=await fetch('/api/gestion/sucursales'); const s=await r.json(); if((usuario.rol||'').toLowerCase().trim()==='admin'){ getEl('selSucursal').innerHTML=s.map(x=>`<option value="${x.id}" ${x.id==sucursalID?'selected':''}>${x.nombre}</option>`).join(''); cont.style.display='block'; } }
   function cambiarSucursal(id) { localStorage.setItem('sucursal_activa', id); location.reload(); }
   async function confirmAction(msg = '¿Seguro?') { const r = await Swal.fire({ title: msg, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí' }); return r.isConfirmed; }
   function getRegimenDesc(code) { const f = REGIMENES.find(x => x.c === code); return f ? f.d : code; }
   function getUsoDesc(code) { const f = USOS_CFDI.find(x => x.c === code); return f ? f.d : code; }
   
   window.delProd = async function(id) { if(await confirmAction('¿Eliminar?')) { await fetch('/api/gestion/inventario/borrar', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) }); window.loadInv(); } };
   window.modalSucursal = async function(s = null) { const { value: f } = await Swal.fire({ title: s ? 'Editar' : 'Nueva', html: `<input id="sn" class="swal2-input" value="${s ? s.nombre : ''}" placeholder="Nombre"><input id="sp" class="swal2-input" value="${s ? s.prefijo : ''}" placeholder="Prefijo">`, preConfirm: () => { return { id: s ? s.id : null, nombre: getEl('sn').value, prefijo: getEl('sp').value, direccion: '', telefono: '' } } }); if (f) { await fetch('/api/gestion/sucursales/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); window.loadSucursalesTable(); } }
   window.loadSucursalesTable = async function() { const r = await fetch('/api/gestion/sucursales'); const d = await r.json(); getEl('tblSucursales').innerHTML = d.map(s => `<tr><td>${s.nombre}</td><td>${s.prefijo}</td><td><button class="btn btn-sm btn-primary" onclick='window.modalSucursal(${JSON.stringify(s)})'>✏️</button></td></tr>`).join(''); }
   // --- EN public/app.js ---

    // --- PEGAR EN public/app.js ---

    window.modalUser = async function() { 
        // 1. Cargamos las sucursales disponibles para listarlas
        let optionsSucursal = '';
        try {
            const r = await fetch('/api/gestion/sucursales');
            const sucursales = await r.json();
            // Creamos las opciones del selector (Marcamos la actual por defecto)
            optionsSucursal = sucursales.map(s => 
                `<option value="${s.id}" ${s.id == sucursalID ? 'selected' : ''}>📍 ${s.nombre}</option>`
            ).join('');
        } catch(e) { optionsSucursal = `<option value="${sucursalID}">Sucursal Actual</option>`; }

        const { value: f } = await Swal.fire({ 
            title: 'Nuevo Usuario', 
            html: `
                <label class="small fw-bold text-muted w-100 text-start">Datos de Acceso</label>
                <input id="un" class="swal2-input m-0 mb-2" placeholder="Nombre Completo">
                <input id="uu" class="swal2-input m-0 mb-2" placeholder="Usuario (Login)">
                <input id="up" type="password" class="swal2-input m-0 mb-3" placeholder="Contraseña">
                
                <label class="small fw-bold text-muted w-100 text-start">Rol y Ubicación</label>
                <select id="ur" class="swal2-input m-0 mb-2">
                    <option value="cajero">Cajero</option>
                    <option value="delivery">Repartidor (Delivery)</option> 
                    <option value="admin">Administrador</option>
                </select>
                
                <select id="us" class="swal2-input m-0">
                    ${optionsSucursal}
                </select>
                `, 
            preConfirm: () => ({ 
                nombre: getEl('un').value, 
                usuario: getEl('uu').value, 
                password: getEl('up').value, 
                rol: getEl('ur').value, 
                sucursal_id: getEl('us').value // <--- AQUÍ CAPTURAMOS LA SUCURSAL ELEGIDA
            }) 
        }); 
        
        if (f) { 
            // Validación básica
            if(!f.nombre || !f.usuario || !f.password) return Swal.showValidationMessage('Faltan datos');

            const r = await fetch('/api/gestion/usuarios/crear', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(f) 
            }); 
            
            if(!r.ok) return Swal.fire('Error', 'No se pudo crear. ¿Usuario duplicado?', 'error');
            window.loadUsers(); 
            Swal.fire('Creado', `Usuario asignado a la sucursal seleccionada.`, 'success');
        } 
    };
   window.loadUsers = async function() { const r = await fetch('/api/gestion/usuarios'); const u = await r.json(); getEl('tblUsers').innerHTML = u.map(x => `<tr><td>${x.nombre}</td><td>${x.rol}</td><td><button class="btn btn-sm btn-outline-danger" onclick="window.delUser(${x.id})">Borrar</button></td></tr>`).join(''); }
   window.delUser = async function(id) { if (await confirmAction()) { await fetch('/api/gestion/usuarios/borrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); window.loadUsers(); } }
// --- PEGAR EN public/app.js ---

    window.loadAuditoria = async function() { 
        try { 
            // Si soy admin, pido logs de la sucursal activa.
            // (Ojo: Podríamos hacer un selector para ver TODAS las sucursales)
            const r = await fetch(`/api/gestion/auditoria?sucursal_id=${sucursalID}`); 
            const d = await r.json(); 
            const tbl = getEl('tblAudit'); 
            
            if (!d || d.length === 0) { 
                tbl.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-muted">No hay actividad registrada</td></tr>'; 
                return; 
            } 
            
            tbl.innerHTML = d.map(a => {
                // Colores según la acción
                let badgeColor = 'bg-secondary';
                let icon = 'bi-info-circle';
                
                const accion = (a.accion || '').toUpperCase();
                if(accion.includes('CREAR') || accion.includes('ADD') || accion.includes('APERTURA')) { badgeColor = 'bg-success'; icon='bi-plus-circle'; }
                if(accion.includes('BORRAR') || accion.includes('DEL') || accion.includes('ELIMINAR')) { badgeColor = 'bg-danger'; icon='bi-trash'; }
                if(accion.includes('EDITAR') || accion.includes('MODIFICAR')) { badgeColor = 'bg-warning text-dark'; icon='bi-pencil'; }
                if(accion.includes('CIERRE')) { badgeColor = 'bg-dark'; icon='bi-lock-fill'; }
                if(accion.includes('VENTA') || accion.includes('LIQUIDACION')) { badgeColor = 'bg-primary'; icon='bi-cash'; }

                const fechaFmt = new Date(a.fecha).toLocaleString('es-MX', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});

                return `
                <tr>
                    <td class="text-center"><small class="text-muted">${fechaFmt}</small></td>
                    <td>
                        <div class="fw-bold text-dark">${a.usuario_nombre || 'Desconocido'}</div>
                        <small class="text-muted" style="font-size:10px;">${a.sucursal_nombre || 'Sucursal ?'}</small>
                    </td>
                    <td><span class="badge ${badgeColor}">${a.modulo}</span></td>
                    <td>
                        <div class="fw-bold small"><i class="bi ${icon}"></i> ${a.accion}</div>
                    </td>
                    <td class="small text-muted" style="max-width: 250px; white-space: normal;">
                        ${a.detalles || ''}
                    </td>
                </tr>`;
            }).join(''); 
        } catch(e) { console.error(e); } 
    };   
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
            safeText('kpi-caja', money(d.balance.utilidad)); // OJO: Corregí esto para que muestre la Utilidad real (Ingresos - Gastos)
            
            // --- TABLA DE MOVIMIENTOS ---
            getEl('tbl-reporte-360').innerHTML = d.movimientos.ingresos.map(o => {
                // 1. Formatear la fecha
                const fechaFmt = o.fecha ? o.fecha.split('T')[0] : '--';
                
                let claseFila = "";
                let textoEstado = "";
                let folioHtml = o.folio;

                // 2. Lógica para CANCELADAS y Deudas
                if (o.estatus === 'cancelada') {
                    claseFila = "table-danger text-danger text-decoration-line-through";
                    textoEstado = "<span class='badge bg-danger'>CANCELADA</span>";
                    folioHtml = `${o.folio} (X)`;
                } else {
                    const deuda = parseFloat(o.deuda_actual || 0);
                    textoEstado = deuda > 0.5 
                        ? `<span class="text-danger fw-bold">${money(deuda)}</span>` 
                        : `<span class="text-success small fw-bold">PAGADO</span>`;
                }

                // 3. Renderizar fila
                return `<tr class="${claseFila}">
                    <td><small>${fechaFmt}</small></td>
                    <td class="fw-bold">${folioHtml}</td>
                    <td>${o.cliente}</td>
                    <td><span class="badge bg-light text-dark border">${o.metodo_pago}</span></td>
                    <td class="text-end text-muted">${money(o.total_orden || 0)}</td>
                    <td class="text-end fw-bold text-primary">${money(o.abono)}</td>
                    <td class="text-end">${textoEstado}</td>
                </tr>`;
            }).join(''); 
            
        } catch (e) { console.error("Error reporte:", e); } 
    };
   
    // --- HISTORIAL CON FILTRO ANTI-DUPLICADOS ---
   // --- HISTORIAL MEJORADO (CON HORA REAL DE ENTREGA) ---
    // --- PEGAR EN public/app.js ---
    window.loadHistorial = async function() { 
        const ini = getEl('h-ini').value; 
        const fin = getEl('h-fin').value; 
        
        // 1. Obtener datos
        const r = await fetch(`/api/ordenes/listado?sucursal_id=${sucursalID}`); 
        const d = await r.json(); 
        
        // 2. Filtro de fechas
        let filtrados = d.filter(o => o.fecha_creacion.split('T')[0] >= ini); 
        if(fin) filtrados = filtrados.filter(o => o.fecha_creacion.split('T')[0] <= fin);
        
        // 3. FILTRO ANTI-DUPLICADOS (El que ya teníamos)
        const ordenesUnicas = {};
        filtrados.forEach(o => {
            if (!ordenesUnicas[o.folio] || o.id > ordenesUnicas[o.folio].id) {
                ordenesUnicas[o.folio] = o;
            }
        });
        const listaFinal = Object.values(ordenesUnicas).sort((a, b) => b.id - a.id);

        // 4. Renderizar
        getEl('tblHistorial').innerHTML = listaFinal.map(o => {
            
            let infoEntrega = '';
            
            // LÓGICA DE FECHAS CLAVE:
            
            // CASO A: YA SE ENTREGÓ (Mostrar hora real de cámaras)
            if(o.estatus === 'entregado' && o.fecha_real_entrega) {
                const fReal = new Date(o.fecha_real_entrega);
                // Si la hora sale mal (UTC), descomenta la siguiente línea:
                // fReal.setHours(fReal.getHours() - 6); 

                const dia = fReal.toLocaleDateString('es-MX', {day:'numeric', month:'short'});
                const hora = fReal.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
                
                infoEntrega = `<div class="text-success small fw-bold">
                                <i class="bi bi-check-circle-fill"></i> Entregado:<br>
                                ${dia} - ${hora}
                            </div>`;
            } 
            // CASO B: AÚN NO SE ENTREGA (Mostrar promesa del ticket)
            else if (o.fecha_entrega) {
                const fPromesa = new Date(o.fecha_entrega);
                fPromesa.setHours(fPromesa.getHours() + 12); 
                const dia = fPromesa.toLocaleDateString('es-MX', {day:'numeric', month:'short'});
                const hora = o.horario_entrega ? `<br><span class="text-muted" style="font-size:0.8em">${o.horario_entrega}</span>` : '';
                
                infoEntrega = `<div class="text-primary small fw-bold">
                                Promesa:<br>${dia} ${hora}
                                </div>`;
            } else {
                infoEntrega = '<span class="text-muted small">--</span>';
            }

            // Colores de estatus
            let estatusColor = 'text-dark';
            if(o.estatus === 'pendiente') estatusColor = 'text-danger fw-bold';
            if(o.estatus === 'lavando') estatusColor = 'text-primary fw-bold';
            if(o.estatus === 'listo') estatusColor = 'text-success fw-bold';
            if(o.estatus === 'entregado') estatusColor = 'text-muted';
            if(o.estatus === 'cancelada') estatusColor = 'text-decoration-line-through text-danger';

            return `<tr>
                <td class="fw-bold">${o.folio}</td>
                <td>
                    <div class="small text-muted">Recibido: ${o.fecha_creacion.split('T')[0]}</div>
                </td>
                <td>${infoEntrega}</td>
                <td>
                    <div class="fw-bold text-truncate" style="max-width: 150px;">${o.cliente}</div>
                </td>
                <td class="text-end fw-bold">${money(o.total)}</td>
                <td class="text-center">
                    ${o.saldo > 0.5 
                        ? `<span class="badge bg-danger">DEBE ${money(o.saldo)}</span>` 
                        : '<span class="badge bg-success">PAGADO</span>'}
                </td>
                <td class="${estatusColor} text-uppercase small">${o.estatus}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" onclick="window.verDetalles(${o.id}, '${o.folio}')">
                        Ver
                    </button>
                </td>
            </tr>`;
        }).join(''); 
    };
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
    // --- PEGAR EN public/app.js (Reemplazando window.exportSmartPDF) ---

    window.exportSmartPDF = async function() {
        if (!window.jspdf) return Swal.fire('Error', 'Librería PDF no cargada', 'error');
        const { jsPDF } = window.jspdf;
        
        const ini = getEl('rep-ini').value;
        const fin = getEl('rep-fin').value;
        if(!ini || !fin) return Swal.showValidationMessage('Selecciona fechas');

        // 1. OBTENER DATOS
        const r = await fetch(`/api/ordenes/reporte-completo?sucursal_id=${sucursalID}&inicio=${ini}&fin=${fin}`);
        const data = await r.json();

        // 2. PREPARAR DOCUMENTO
        const doc = new jsPDF();
        const width = doc.internal.pageSize.getWidth(); 

        // ENCABEZADO
        doc.setFillColor(26, 29, 33);
        doc.rect(0, 0, width, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22); doc.setFont("helvetica", "bold");
        doc.text("REPORTE FINANCIERO", 14, 20);
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        doc.text(`Generado: ${new Date().toLocaleString()}`, width - 14, 15, { align: 'right' });
        doc.text(`Periodo: ${ini} al ${fin}`, width - 14, 25, { align: 'right' });

        // TARJETAS DE TOTALES
        const startY = 50;
        
        // Tarjeta Financiera
        doc.setDrawColor(200, 200, 200); doc.setFillColor(255, 255, 255);
        doc.roundedRect(14, startY, 88, 30, 3, 3, 'FD');
        doc.setFontSize(8); doc.setTextColor(100);
        doc.text('TOTAL INGRESOS', 24, startY + 10);
        doc.text('GASTOS (Aplicados)', 54, startY + 10); // Aclaración visual
        doc.text('UTILIDAD', 84, startY + 10);

        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.setTextColor(59, 130, 246); doc.text(money(data.balance.ingresos_totales), 24, startY + 20);
        doc.setTextColor(220, 53, 69); doc.text(money(data.balance.egresos_totales), 54, startY + 20);
        doc.setTextColor(25, 135, 84); doc.text(money(data.balance.utilidad), 84, startY + 20);

        // Tarjeta Métodos
        doc.setDrawColor(200, 200, 200); doc.setFillColor(255, 255, 255);
        doc.roundedRect(108, startY, 88, 30, 3, 3, 'FD'); 
        doc.setFontSize(8); doc.setTextColor(100);
        doc.text("EFECTIVO", 125, startY + 10);
        doc.text("TARJETA", 165, startY + 10);
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0); 
        doc.text(money(data.balance.desglose.efectivo), 125, startY + 20);
        doc.text(money(data.balance.desglose.tarjeta), 165, startY + 20);

        // --- PROCESAMIENTO DE FILAS ---
        let filas = [];
        
        // A) Ingresos
        if (data.movimientos && data.movimientos.ingresos) {
            data.movimientos.ingresos.forEach(i => {
                const abono = parseFloat(i.abono);
                const total = parseFloat(i.total_orden);
                let conceptoSmart = i.cliente.substring(0, 20); 
                let tipoFila = 'ingreso';
                let estadoTexto = (i.deuda_actual > 0) ? `RESTA $${i.deuda_actual}` : 'LIQUIDADO';

                if (i.estatus === 'cancelada') {
                    conceptoSmart = `[CANCELADA] ${i.cliente.substring(0, 15)}`;
                    tipoFila = 'cancelada';
                    estadoTexto = 'CANCELADO';
                } else if (abono === 0) {
                    conceptoSmart = `ENTREGA: ${i.cliente.substring(0, 15)}`;
                    tipoFila = 'entrega';
                } else if (abono >= total) {
                    conceptoSmart = `PAGO ÚNICO: ${i.cliente.substring(0, 15)}`;
                } else {
                    conceptoSmart = `ABONO: ${i.cliente.substring(0, 15)}`;
                }

                filas.push({
                    fecha: i.fecha, folio: i.folio, cliente: conceptoSmart,
                    metodo: i.metodo_pago || 'Otro', total: total, abono: abono, 
                    estado: estadoTexto, tipo: tipoFila
                });
            });
        }

        // B) Gastos (AQUÍ ESTÁ LA CORRECCIÓN)
        if (data.movimientos && data.movimientos.egresos) {
            data.movimientos.egresos.forEach(g => {
                
                // Verificamos si está cancelado
                const esCancelado = (g.estatus === 'cancelado');
                
                filas.push({
                    fecha: g.fecha, 
                    folio: 'GASTO', 
                    cliente: esCancelado ? `[CANCELADO] ${g.descripcion}` : (g.descripcion || 'Gasto'),
                    metodo: g.metodo_pago || 'Efectivo', 
                    total: parseFloat(g.monto),
                    abono: parseFloat(g.monto), 
                    estado: esCancelado ? 'CANCELADO' : 'APLICADO', 
                    tipo: esCancelado ? 'gasto-cancelado' : 'gasto' // Nuevo tipo para pintar rojo
                });
            });
        }

        filas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // GENERAR TABLA
        doc.autoTable({
            startY: 90,
            head: [['Fecha', 'Folio', 'Concepto / Cliente', 'Método', 'Total Nota', 'Monto', 'Estado']],
            body: filas.map(f => [
                f.fecha.substring(0, 10), f.folio, f.cliente,
                f.tipo === 'entrega' ? '--' : f.metodo.toUpperCase(), 
                money(f.total), money(f.abono), f.estado
            ]),
            theme: 'striped',
            headStyles: { fillColor: [26, 29, 33], textColor: [255, 255, 255], fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 3, valign: 'middle' }, 
            columnStyles: { 
                4: { halign: 'right', textColor: [150, 150, 150] }, 
                5: { halign: 'right', fontStyle: 'bold' } 
            },
            didParseCell: function (data) {
                if (data.section === 'body') {
                    const row = filas[data.row.index];

                    // 1. GASTOS ACTIVOS (ROJO)
                    if (row.tipo === 'gasto') {
                        data.cell.styles.textColor = [220, 53, 69]; 
                    } 
                    // 2. GASTOS CANCELADOS O VENTAS CANCELADAS (ROJO TACHADO/ITÁLICA)
                    else if (row.tipo === 'cancelada' || row.tipo === 'gasto-cancelado') {
                        data.cell.styles.textColor = [220, 53, 69]; 
                        data.cell.styles.fontStyle = 'italic';
                        // Nota: Si usas jspdf-autotable reciente, puedes intentar 'line-through'
                    }
                    // 3. ENTREGAS
                    else if (row.tipo === 'entrega') {
                        data.cell.styles.textColor = [160, 160, 160];
                        data.cell.styles.fontStyle = 'italic'; 
                    }
                    // 4. INGRESOS
                    else {
                        if (data.column.index === 3) {
                            const m = row.metodo.toLowerCase();
                            if (m.includes('efectivo')) data.cell.styles.textColor = [25, 135, 84]; 
                            if (m.includes('tarjeta')) data.cell.styles.textColor = [13, 110, 253]; 
                        }
                        if (data.column.index === 5) data.cell.styles.textColor = [0, 0, 0]; 
                        if (data.column.index === 6) {
                            if (row.estado === 'LIQUIDADO') data.cell.styles.textColor = [25, 135, 84];
                            else data.cell.styles.textColor = [220, 53, 69];
                        }
                    }
                }
            }
        });

        doc.save(`Reporte_Financiero_${ini}.pdf`);
    };

    // --- PEGAR AL FINAL DE public/app.js (Antes del bloque de Inicialización) ---

    // 1. FUNCIÓN PRINCIPAL DE BÚSQUEDA
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

    window.updateTimeline = function(estatus) {
        const bar = getEl('res-bar');
        const stText = getEl('res-status-text');
        if(!bar) return;
        
        ['lav','lis','ent'].forEach(k => { const ic=getEl('icon-'+k); if(ic) ic.className = 'bi bi-circle text-muted'; });

        let w = '0%'; let color = 'bg-secondary'; let texto = 'PENDIENTE';

        if (estatus === 'pendiente') { w = '15%'; color = 'alert-secondary'; } 
        else if (estatus === 'lavando') { w = '50%'; color = 'alert-info'; texto = 'LAVANDO'; if(getEl('icon-lav')) getEl('icon-lav').className = 'bi bi-water text-info'; } 
        else if (estatus === 'listo') { w = '75%'; color = 'alert-success'; texto = 'LISTO'; if(getEl('icon-lav')) getEl('icon-lav').className='bi bi-check-circle-fill text-success'; if(getEl('icon-lis')) getEl('icon-lis').className='bi bi-check-circle-fill text-success'; } 
        else if (estatus === 'entregado') { w = '100%'; color = 'alert-dark bg-dark text-white'; texto = 'ENTREGADO'; if(getEl('icon-lav')) getEl('icon-lav').className='bi bi-check-circle-fill text-success'; if(getEl('icon-lis')) getEl('icon-lis').className='bi bi-check-circle-fill text-success'; if(getEl('icon-ent')) getEl('icon-ent').className='bi bi-box-seam-fill text-dark'; } 
        else if (estatus === 'cancelada') { w = '100%'; color = 'alert-danger'; texto = 'CANCELADA'; bar.className = 'progress-bar bg-danger'; }

        bar.style.width = w; stText.className = `alert ${color} fw-bold border mt-3 mb-0 text-center`; stText.innerText = texto;
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

    // 1. MODAL NUEVO GASTO MEJORADO
    window.nuevoGastoModal = async function() {
        const { value: formValues } = await Swal.fire({
            title: 'Registrar Salida de Dinero',
            html: `
                <div class="text-start">
                    <label class="small fw-bold">Monto ($)</label>
                    <input id="sw-monto" type="number" class="form-control mb-2" placeholder="0.00">
                    
                    <label class="small fw-bold">Concepto / Descripción</label>
                    <input id="sw-desc" class="form-control mb-2" placeholder="Ej. Jabón, Luz, Sueldo...">
                    
                    <div class="row g-2 mb-2">
                        <div class="col-6">
                            <label class="small fw-bold">Proveedor (Opcional)</label>
                            <input id="sw-prov" class="form-control" placeholder="Ej. Costco">
                        </div>
                        <div class="col-6">
                            <label class="small fw-bold">Categoría</label>
                            <select id="sw-cat" class="form-select">
                                <option value="Insumos">Insumos (Jabón, etc)</option>
                                <option value="Servicios">Servicios (Luz, Agua)</option>
                                <option value="Mantenimiento">Mantenimiento</option>
                                <option value="Nomina">Nómina / Sueldos</option>
                                <option value="Renta">Renta</option>
                                <option value="Otros">Otros</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-check form-switch p-3 bg-light rounded border">
                        <input class="form-check-input" type="checkbox" id="sw-factura">
                        <label class="form-check-label fw-bold" for="sw-factura">✅ ¿Tiene Factura?</label>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Registrar Gasto',
            preConfirm: () => {
                const monto = getEl('sw-monto').value;
                const desc = getEl('sw-desc').value;
                if (!monto || !desc) Swal.showValidationMessage('Monto y Concepto son obligatorios');
                return {
                    monto: parseFloat(monto),
                    descripcion: desc,
                    proveedor: getEl('sw-prov').value,
                    categoria: getEl('sw-cat').value,
                    tiene_factura: getEl('sw-factura').checked,
                    sucursal_id: sucursalID,
                    usuario_id: usuario ? usuario.id : 1
                };
            }
        });

        if (formValues) {
            const r = await fetch('/api/finanzas/gasto', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formValues)
            });
            if(r.ok) {
                Swal.fire('Guardado', 'Gasto registrado correctamente', 'success');
                window.loadGastosView(); // Recargar tabla si estamos ahí
            }
        }
    };

    // 2. CARGAR VISTA DE GASTOS
    window.loadGastosView = async function() {
        let ini = getEl('gasto-ini').value;
        let fin = getEl('gasto-fin').value;
        
        // Fechas por defecto (Mes actual)
        if(!ini) { 
            const d = new Date(); 
            ini = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10); 
            fin = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0,10);
            getEl('gasto-ini').value = ini; 
            getEl('gasto-fin').value = fin;
        }

        const r = await fetch(`/api/finanzas/reporte-gastos?sucursal_id=${sucursalID}&inicio=${ini}&fin=${fin}`);
        const data = await r.json();

        // Actualizar Totales
        safeText('gasto-total', money(data.totales.total));
        safeText('gasto-factura', money(data.totales.deducible));
        safeText('gasto-sin', money(data.totales.no_deducible));

        // Llenar Tabla
        const tbl = getEl('tblGastos');
        if(data.gastos.length === 0) {
            tbl.innerHTML = '<tr><td colspan="7" class="text-center p-4">No hay gastos en este periodo</td></tr>';
            return;
        }

       
        tbl.innerHTML = data.gastos.map(g => {
            
            let filaClass = "";
            let montoHtml = `<span class="fw-bold text-danger">-${money(g.monto)}</span>`;
            let btnBorrar = `<button class="btn btn-sm btn-outline-danger" onclick="window.borrarGasto(${g.id})"><i class="bi bi-trash"></i></button>`;
            let estadoIcon = g.tiene_factura ? '<span class="text-success fs-5">✅</span>' : '<span class="text-muted opacity-25">❌</span>';

            // SI ESTÁ CANCELADO
            if (g.estatus === 'cancelado') {
                filaClass = "table-danger text-muted text-decoration-line-through"; // Rojo tachado
                montoHtml = `<span class="fw-bold text-muted">${money(g.monto)}</span>`; // Monto gris
                btnBorrar = `<span class="badge bg-danger">CANCELADO</span>`; // Sin botón
                estadoIcon = ''; // Sin icono de factura
            }

            return `
            <tr class="${filaClass}">
                <td><small>${g.fecha.substring(0,10)}</small></td>
                <td class="fw-bold">${g.descripcion}</td>
                <td>${g.proveedor || '--'}</td>
                <td><span class="badge bg-secondary">${g.categoria}</span></td>
                <td class="text-center">${estadoIcon}</td>
                <td class="text-end">${montoHtml}</td>
                <td class="text-end">${btnBorrar}</td>
            </tr>`;
        }).join('');
        
        // Guardamos datos para el PDF
        window.gastosDataTemp = data;
    };

    // 3. GENERAR PDF DE GASTOS
    window.printGastosPDF = function() {
        // 1. Validación de datos
        if(!window.gastosDataTemp || !window.gastosDataTemp.gastos) return Swal.fire('Error', 'No hay datos cargados', 'warning');
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const data = window.gastosDataTemp;
        
        // 2. Encabezado Rojo (Distingue que es Reporte de Salidas)
        doc.setFillColor(220, 53, 69); // Rojo corporativo
        doc.rect(0, 0, 210, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20); doc.text("REPORTE DE GASTOS", 14, 20);
        
        // Fechas
        doc.setFontSize(10); 
        doc.text(`${getEl('gasto-ini').value} al ${getEl('gasto-fin').value}`, 200, 20, { align: 'right' });
    
        // 3. Tabla de Totales (Resumen)
        doc.setTextColor(0,0,0);
        doc.text(`Total Gastado: ${money(data.totales.total)}`, 14, 40);
        doc.text(`Deducible (Con Factura): ${money(data.totales.deducible)}`, 14, 46);
        
        // 4. Preparar filas (Detectando cancelados)
        const filas = data.gastos.map(g => {
            // Si está cancelado, modificamos el texto del concepto
            const descripcionFinal = (g.estatus === 'cancelado') 
                ? `[CANCELADO] ${g.descripcion}` 
                : g.descripcion;
    
            return [
                g.fecha.substring(0,10),
                descripcionFinal,
                g.proveedor,
                g.categoria,
                g.tiene_factura ? 'SI' : 'NO',
                money(g.monto)
            ];
        });
    
        // 5. Generar Tabla con estilos condicionales
        doc.autoTable({
            startY: 55,
            head: [['Fecha', 'Concepto', 'Proveedor', 'Categoría', 'Factura', 'Monto']],
            body: filas,
            theme: 'grid',
            headStyles: { fillColor: [50, 50, 50] }, // Encabezado Gris Oscuro
            didParseCell: function(data) {
                if (data.section === 'body') {
                    const rowData = data.row.raw; // Acceso a los datos crudos de la fila
                    const concepto = rowData[1];  // La columna 1 es la descripción
    
                    // CASO A: GASTO CANCELADO (Prioridad Alta)
                    // Verificamos si el texto empieza con [CANCELADO]
                    if (concepto.toString().startsWith('[CANCELADO]')) {
                        data.cell.styles.textColor = [220, 53, 69]; // Rojo
                        data.cell.styles.fontStyle = 'italic';      // Letra inclinada
                        // (Opcional) data.cell.styles.decoration = 'line-through'; // Tachado (si la versión de jspdf lo soporta)
                    }
                    // CASO B: TIENE FACTURA (Verde) - Solo si no es cancelado
                    else if (data.column.index === 4 && data.cell.raw === 'SI') {
                        data.cell.styles.textColor = [25, 135, 84]; // Verde
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });
    
        doc.save('Gastos_Detallados.pdf');
    };

    window.borrarGasto = async function(id) {
        const { isConfirmed } = await Swal.fire({ title:'¿Cancelar Gasto?', text:'Quedará registrado como cancelado.', icon:'warning', showCancelButton:true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, cancelar' });
        if(isConfirmed) {
            await fetch('/api/finanzas/gasto/borrar', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ id, usuario_id: usuario.id }) // <-- Enviamos usuario
            });
            window.loadGastosView();
            window.loadAuditoria(); // Actualizar logs si se ven
        }
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