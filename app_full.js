
/* Preferido · Nuture — AWS Outage Simulation (R&D Build)
 * Vanilla JS. No external libraries.
 */
(function(){
  'use strict';
  const $ = (id)=>document.getElementById(id);

  // Elements
  const statusPill=$('statusPill'), log=$('log');
  const duration=$('duration'), durationOut=$('durationOut'), severity=$('severity'), region=$('region'), preset=$('preset');
  const az=$('az'), xregion=$('xregion');
  const depS3=$('depS3'), depRDS=$('depRDS'), depIAM=$('depIAM'), depDNS=$('depDNS');
  const rev=$('rev'), fixed=$('fixed'), penalty=$('penalty'), vari=$('var'), varOut=$('varOut'), slo=$('slo');
  const runBtn=$('runBtn'), resetBtn=$('resetBtn'), exportBtn=$('exportBtn');

  const uptime=$('uptime'), loss=$('loss'), rto=$('rto'), rpo=$('rpo');
  const ttf=$('ttf'), ttd=$('ttd'), ttr=$('ttr'), tco=$('tco');
  const pillBudget=$('pillBudget'), pillBacklog=$('pillBacklog'), pillBreach=$('pillBreach');
  const steps = ['t0','t1','t2','t3','t4','t5'].map($);

  // Tabs
  const tabPreset=$('tabPreset'), tabArch=$('tabArch'), tabCosts=$('tabCosts');
  const panelPreset=$('panelPreset'), panelArch=$('panelArch'), panelCosts=$('panelCosts');
  tabPreset.addEventListener('click',()=>activateTab('preset'));
  tabArch.addEventListener('click',()=>activateTab('arch'));
  tabCosts.addEventListener('click',()=>activateTab('costs'));
  function activateTab(which){
    [tabPreset,tabArch,tabCosts].forEach(t=>t.classList.remove('active'));
    [panelPreset,panelArch,panelCosts].forEach(p=>p.classList.add('hide'));
    if(which==='preset'){ tabPreset.classList.add('active'); panelPreset.classList.remove('hide'); }
    if(which==='arch'){ tabArch.classList.add('active'); panelArch.classList.remove('hide'); }
    if(which==='costs'){ tabCosts.classList.add('active'); panelCosts.classList.remove('hide'); }
  }

  // Live outputs
  duration.addEventListener('input', ()=> durationOut.textContent = duration.value);
  vari.addEventListener('input', ()=> varOut.textContent = vari.value + '%');

  // Scenario presets
  const presets = {
    'iam-global': {service:'IAM', deps:{s3:false,rds:false,iam:true,dns:true}},
    's3-regional': {service:'S3', deps:{s3:true,rds:false,iam:false,dns:false}},
    'rds-failover': {service:'RDS', deps:{s3:false,rds:true,iam:false,dns:false}},
    'route53': {service:'Route53', deps:{s3:false,rds:false,iam:false,dns:true}},
    'lambda-api': {service:'Lambda', deps:{s3:true,rds:false,iam:false,dns:false}},
  };
  preset.addEventListener('change',()=>applyPreset());
  function applyPreset(){
    const p = presets[preset.value] || presets['s3-regional'];
    depS3.checked = p.deps.s3; depRDS.checked = p.deps.rds; depIAM.checked = p.deps.iam; depDNS.checked = p.deps.dns;
  }
  applyPreset();

  // Utils
  function fmtUSD(n){ try{ return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);}catch(e){return '$'+n;} }
  function logLine(text){
    const ts = new Date().toISOString().replace('T',' ').replace('Z',' UTC');
    const p = document.createElement('div'); p.textContent = `[${ts}] ${text}`;
    log.appendChild(p); log.scrollTop = log.scrollHeight;
  }
  function clearTimeline(){ steps.forEach(s=>s.classList.remove('active')); }

  // Deterministic PRNG from inputs to keep runs reproducible
  function seedFromInputs(){
    const base = (duration.value|0)*37 + (severity.value==='major'?17:severity.value==='critical'?29:11) + region.value.length*13 + (az.value|0)*7;
    let x = base>>>0;
    return ()=> (x = (1103515245*x + 12345) & 0x7fffffff) / 0x7fffffff;
  }

  // Core model
  function computeModel(){
    const mins = parseInt(duration.value,10);
    const sevFactor = {minor:0.35, major:0.6, critical:0.9}[severity.value];
    const regionality = (region.value==='us-east-1') ? 1.0 : 0.85;

    const deps = {s3:depS3.checked, rds:depRDS.checked, iam:depIAM.checked, dns:depDNS.checked};
    const depCount = Object.values(deps).filter(Boolean).length;

    const svcBase = (()=>{
      switch(preset.value){
        case 'iam-global': return 0.85;
        case 'route53': return 0.78;
        case 'rds-failover': return 0.65;
        case 's3-regional': return 0.55;
        case 'lambda-api': return 0.5;
        default: return 0.55;
      }
    })();

    const azFactor = (az.value==='1')?1.0:(az.value==='2'?0.75:0.6);
    const drFactor = (xregion.value==='none')?1.0:(xregion.value==='warm'?0.7:0.45);

    const blastRadius = Math.min(1, (svcBase*sevFactor*regionality) * (0.8 + 0.05*depCount));
    const failoverReadiness = Math.max(0.15, Math.min(0.95, (1 - 0.5*sevFactor) * (1 - 0.3*depCount) * (1 - 0.6*(azFactor-0.6)) * (1 - 0.7*(drFactor-0.45)) ));

    const rand = seedFromInputs();
    const detectMin = Math.max(1, Math.round( (2 + 4*sevFactor) * (1 + 0.2*depCount) * (1 + 0.2*(rand()-0.5)) ));
    const failoverMin = Math.max(3, Math.round( mins * (1 - failoverReadiness) * 0.6 ));
    const recoverMin = Math.max(5, Math.round( mins * (0.35 + 0.2*sevFactor) * (azFactor) * (drFactor) ));

    const RTO = detectMin + failoverMin + recoverMin;
    const RPO = (deps.rds) ? Math.round(mins * 0.05 * (azFactor) * (drFactor)) : Math.round(mins * 0.01 * (drFactor));

    const periodMin = 24*60;
    const estUptime = Math.max(0, 1 - (mins/periodMin) * (0.5 + blastRadius*0.5));

    // Error budget burn for 30-day SLO
    const sloPct = parseFloat(slo.value);
    const totalMin30 = 30*24*60;
    const allowedDownMin = Math.round(totalMin30 * (1 - sloPct/100));
    const burnMin = Math.min(allowedDownMin, Math.round(mins * (0.6 + 0.4*blastRadius)));
    const burnPct = allowedDownMin ? (burnMin/allowedDownMin)*100 : 0;
    const breach = mins > allowedDownMin;

    // Backlog model: requests arriving per minute; only a fraction served during outage
    const reqPerMin = 800; // illustrative
    const serviceFrac = Math.max(0, 1 - blastRadius); // how much can be served
    const backlog = Math.max(0, Math.round(reqPerMin * mins * (1 - serviceFrac)));

    // Costs
    const revLoss = Math.round((Number(rev.value)||0) * mins * (0.6 + 0.4*blastRadius));
    const fixedCost = Math.round((Number(fixed.value)||0) * (mins/60));
    const variable = Math.round(revLoss * ((Number(vari.value)||0)/100));
    const penalties = breach ? Math.round((Number(penalty.value)||0) * (mins/60)) : 0;
    const incidentTCO = revLoss + fixedCost + variable + penalties;

    return {
      mins, sevFactor, deps, depCount, blastRadius, failoverReadiness,
      detectMin, failoverMin, recoverMin, RTO, RPO, estUptime,
      burnMin, burnPct, breach, backlog, revLoss, fixedCost, variable, penalties, incidentTCO
    };
  }

  function updatePills(m){
    pillBudget.className = 'pill ' + (m.burnPct<60?'ok':(m.burnPct<100?'warn':'bad'));
    pillBudget.textContent = `Budget burn: ${m.burnPct.toFixed(1)}%`;
    pillBacklog.className = 'pill ' + (m.backlog<20000?'ok':(m.backlog<60000?'warn':'bad'));
    pillBacklog.textContent = `Backlog: ${m.backlog} req`;
    pillBreach.className = 'pill ' + (m.breach?'bad':'ok');
    pillBreach.textContent = 'SLO breach: ' + (m.breach?'yes':'no');
  }

  function run(){
    log.textContent=''; clearTimeline();
    const m = computeModel();

    uptime.textContent = (m.estUptime*100).toFixed(3) + '%';
    loss.textContent = fmtUSD(m.revLoss);
    rto.textContent = m.RTO + ' min';
    rpo.textContent = m.RPO + ' min';
    ttf.textContent = m.failoverMin + ' min';
    ttd.textContent = m.detectMin + ' min';
    ttr.textContent = m.recoverMin + ' min';
    tco.textContent = fmtUSD(m.incidentTCO);
    updatePills(m);

    statusPill.className = 'pill ' + ((severity.value==='critical')?'bad':(severity.value==='major'?'warn':'ok'));
    statusPill.textContent = 'Running';

    const msgs = [
      `Trigger: ${preset.options[preset.selectedIndex].text} in ${region.value} (severity=${severity.value}).`,
      `Blast radius ${(m.blastRadius*100).toFixed(1)}% (deps=${m.depCount}, AZ=${az.value}, DR=${xregion.value}).`,
      `Degradation for ${m.mins} min; detect=${m.detectMin}m.`,
      `Failover in ~${m.failoverMin} min (readiness ${(m.failoverReadiness*100)|0}%).`,
      `Recovery ~${m.recoverMin} min. RTO=${m.RTO}m, RPO=${m.RPO}m.`,
      `Budget burn ${m.burnPct.toFixed(1)}%; backlog ${m.backlog} req; rev loss ${fmtUSD(m.revLoss)}; TCO ${fmtUSD(m.incidentTCO)}.`
    ];
    let i=0;
    function step(){
      if(i>0) steps[i-1].classList.remove('active');
      if(i<steps.length){
        steps[i].classList.add('active');
        logLine(msgs[i]);
        i++;
        setTimeout(step, 180);
      }else{
        statusPill.textContent='Complete';
      }
    }
    step();

    // Persist last run for export
    lastResult = { when:new Date().toISOString(), region:region.value, severity:severity.value, az:az.value, dr:xregion.value, slo:slo.value, ...m };
  }

  function reset(){
    log.textContent=''; clearTimeline();
    uptime.textContent='—'; loss.textContent='$0'; rto.textContent='—'; rpo.textContent='—';
    ttf.textContent='—'; ttd.textContent='—'; ttr.textContent='—'; tco.textContent='$0';
    statusPill.className='pill'; statusPill.textContent='Idle';
    updatePills({burnPct:0, backlog:0, breach:false});
    duration.value=45; durationOut.textContent='45'; severity.value='major'; region.value='us-east-1';
    az.value='2'; xregion.value='warm'; vari.value=25; varOut.textContent='25%'; slo.value='99.9';
    applyPreset();
  }

  // Export
  let lastResult = null;
  function exportReport(){
    if(!lastResult){ alert('Run a simulation first.'); return; }
    const csv = [
      ['timestamp','region','severity','AZ','DR','SLO','mins','blastRadius','failoverReadiness','detectMin','failoverMin','recoverMin','RTO','RPO','estUptime','burnMin','burnPct','breach','backlog','revLoss','fixedCost','variable','penalties','incidentTCO'].join(','),
      [lastResult.when,lastResult.region,lastResult.severity,lastResult.az,lastResult.dr,lastResult.slo,lastResult.mins,
       lastResult.blastRadius.toFixed(3),lastResult.failoverReadiness.toFixed(3),lastResult.detectMin,lastResult.failoverMin,lastResult.recoverMin,
       lastResult.RTO,lastResult.RPO,(lastResult.estUptime*100).toFixed(3),lastResult.burnMin,lastResult.burnPct.toFixed(2),lastResult.breach,
       lastResult.backlog,lastResult.revLoss,lastResult.fixedCost,lastResult.variable,lastResult.penalties,lastResult.incidentTCO
      ].join(',')
    ].join('\n');

    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'preferido_nuture_outage_report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  runBtn.addEventListener('click', run);
  resetBtn.addEventListener('click', reset);
  exportBtn.addEventListener('click', exportReport);

  // Init
  reset();
})();
