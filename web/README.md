# Hub Territorial — interface React

Mesmos componentes visuais da versão confirmada no chat: navegação lateral,
visão executiva, mapa, IBGE, ofertas, catálogo, histórico e relatórios.

## Gerar a versão pública

Node 22.13 ou superior. Execute `npm ci` e `npm run build:pages` nesta pasta.
O resultado vai para `../docs` (raiz do site); a compilação preserva as bases JSON.
Um único endereço para todas as cidades: o seletor troca os dados e a escolha fica salva
no navegador. `base: './'` deixa o site funcionar com qualquer nome de repositório.
Malhas de bairros (IBGE, Censo 2022) ficam em `public/territorio/<código IBGE>.geojson`.
Publique `docs` pelo workflow **Publicar Hub Territorial**.

## Dados e armazenamento

Anúncios e histórico públicos são lidos de `docs/curitiba/` (Curitiba) e da raiz `docs/` (Londrina).
Não há dados privados, tokens ou credenciais no código do cliente.
Estudos e importações feitos no GitHub Pages ficam no localStorage deste
navegador, sem sincronização entre usuários/dispositivos. O histórico possui
exportação JSON. A versão privada mantém seu banco próprio e não foi alterada.

IBGE municipal de Curitiba usa a referência validada de 08/10/2026; bairros
oficiais e entorno usam as bases publicadas com sua data. A busca de endereço
consulta o Nominatim ao enviar o formulário. Coletas de portais exigem servidor
e não são executadas pelo GitHub Pages. Nenhuma API paga é chamada neste cliente.

As cidades sem anúncios publicados mostram ausência de dados. Não representam
estoque zero. O catálogo e o histórico mantêm limitações e fontes identificadas.
