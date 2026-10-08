// Fatos consultados em páginas públicas em 08/09/2026. Não são uma coleta automatizada nem posições geográficas.
export const sample=[
{fonte:'Santamérica',id_externo:'55818',titulo:'Residencial Trancoso',bairro:'Jardim Maria Celina',preco:175000,area_m2:46.97,quartos:2,vagas:1},
{fonte:'Santamérica',id_externo:'55815',titulo:'Spazio Leopoldina',bairro:'Gleba Palhano',preco:300000,area_m2:46.65,quartos:2,vagas:1},
{fonte:'Santamérica',id_externo:'55808',titulo:'Edifício Ohara',bairro:'Centro',preco:380000,area_m2:118,quartos:3},
{fonte:'Santamérica',id_externo:'55789',titulo:'Margens do Igapó',bairro:'Lima Azevedo',preco:320000,area_m2:65,quartos:3,vagas:1}
].map(r=>({...r,cidade:'Londrina',finalidade:'venda',tipo:'apartamento',data_coleta:'2026-09-08T12:00:00Z',metodo:'pesquisa em página pública em 08/09/2026; disponibilidade não confirmada',url:'https://www.santamerica.com.br/comprar/Londrina/Apartamento',latitude:null,longitude:null}));
