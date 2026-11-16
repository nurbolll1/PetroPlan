// Cloudflare Worker example for list. meal-planning AI.
// Deploy separately, set OPENAI_API_KEY as a Worker secret.
// IMPORTANT: before exposing publicly, enable Cloudflare rate limiting / bot protection.
// This origin check is only CORS, not authentication or billing protection.
const ORIGIN = 'https://nurbolll1.github.io';
const reply = (value, status=200) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Cache-Control':'no-store'}
});
export default {
 async fetch(request, env) {
   if(request.headers.get('Origin')!==ORIGIN) return new Response('Forbidden',{status:403});
   if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{
     'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS',
     'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
   if(request.method!=='POST') return reply({error:'Use POST'},405);
   if(!env.OPENAI_API_KEY) return reply({error:'Server is not configured'},503);
   const length=Number(request.headers.get('content-length')||0);
   if(length>65000) return reply({error:'Request too large'},413);
   try {
     const raw=await request.text();
     if(raw.length>65000) return reply({error:'Request too large'},413);
     const p=JSON.parse(raw);
     const {people,days,meals,budget}=p;
     if(!Number.isInteger(people)||people<1||people>12||
        ![3,5,7].includes(days)||![2,3].includes(meals)||
        !Number.isFinite(budget)||budget<100||budget>10000000||
        !Array.isArray(p.products)||p.products.length>250) return reply({error:'Invalid inputs'},400);
     const products=p.products.filter(x=>typeof x.id==='string'&&
       typeof x.name==='string'&&typeof x.price==='number'&&x.price>=0&&
       ['кг','л','шт'].includes(x.unit)).map(x=>({
         id:x.id.slice(0,80),name:x.name.slice(0,100),price:x.price,unit:x.unit,
         category:String(x.category||'').slice(0,40)}));
     if(products.length<3) return reply({error:'Too few products'},400);
     const constraints={budget,people,days,meals,excludes:
       Array.isArray(p.excludes)?p.excludes.slice(0,20).map(x=>String(x).slice(0,70)):[]};
     const system=[
       'Ты повар и планировщик покупок для Казахстана. Ответь исключительно JSON объектом {"rows":[...]}.',
       'Составь реалистичное меню на каждый день для указанного числа людей.',
       'Каждый элемент rows — {"name": string, "steps": string, "ingredients":[{"id":string, "qty":number}]}.',
       'Ровно days*meals элементов в хронологическом порядке: при 3 приёмах завтрак, обед, ужин; при 2 обед, ужин.',
       'Используй только id продуктов из присланного каталога; qty — объём покупки для ВСЕХ людей:',
       'для кг — в килограммах, для л — в литрах, для шт — в штуках.',
       'Старайся уложиться в бюджет на все блюда. Учитывай исключения.',
       'Шаги приготовления должны быть практичными и безопасными; курица и яйца должны быть полностью приготовлены.',
       'Если из доступных продуктов невозможно составить питательно полноценное меню, не заявляй о его полноценности.',
       'Отвечай на русском языке. JSON без markdown.'
     ].join(' ');
     const upstream=await fetch('https://api.openai.com/v1/chat/completions',{
       method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.OPENAI_API_KEY},
       body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4o-mini',
         response_format:{type:'json_object'},
         messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({constraints,products})}],
         max_completion_tokens:3000})});
     if(!upstream.ok) return reply({error:'AI provider error'},502);
     const json=await upstream.json();
     const content=json.choices?.[0]?.message?.content;
     if(typeof content!=='string') return reply({error:'Empty model response'},502);
     const result=JSON.parse(content);
     if(!Array.isArray(result.rows)) return reply({error:'Invalid model response'},502);
     return reply({rows:result.rows});
   }catch(e){return reply({error:'Could not generate menu'},500)}
 }
};
