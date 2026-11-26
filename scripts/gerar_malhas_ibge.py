"""Gera malhas de bairros (IBGE, Censo 2022) em web/public/territorio a partir dos GeoPackages por UF.

Uso: python scripts/gerar_malhas_ibge.py PASTA_COM_UF.gpkg web/public/territorio
Baixe PR.gpkg, SP.gpkg, MS.gpkg em ftp.ibge.gov.br/.../malha_com_atributos/bairros/gpkg/UF/<UF>/.
Requer geopandas. Edite o dicionário `want` para incluir outras cidades.
"""
import sys,json
import geopandas as gpd
src,out=sys.argv[1],sys.argv[2]
FONTE='https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/bairros/gpkg/UF/{uf}/{uf}_bairros_CD2022.gpkg'
want={'PR':['4119905','4104808','4108304','4125506'],'SP':['3543402','3525904','3538709','3548500'],'MS':['5008305']}
for uf,codes in want.items():
    g=gpd.read_file(f'{src}/{uf}.gpkg')
    for code in codes:
        f=g[g.CD_MUN.astype(str)==code].to_crs(4326).copy()
        if f.empty: continue
        f['geometry']=f.geometry.simplify(0.00008,preserve_topology=True)
        feats=[]
        for _,r in f.iterrows():
            def num(v):
                try:return int(float(v))
                except:return None
            feats.append({'type':'Feature','properties':{'codigo':str(r.CD_BAIRRO),'nome':r.NM_BAIRRO,'ano':2022,'populacao':num(r.v0001),'domicilios':num(r.v0002),'fonte':FONTE.format(uf=uf),'limites_compativeis':False},'geometry':json.loads(gpd.GeoSeries([r.geometry]).to_json())['features'][0]['geometry']})
        def rnd(c):
            return [rnd(x) for x in c] if isinstance(c[0],list) else [round(c[0],5),round(c[1],5)]
        for ft in feats: ft['geometry']['coordinates']=rnd(ft['geometry']['coordinates'])
        json.dump({'type':'FeatureCollection','features':feats},open(f'{out}/{code}.geojson','w'),ensure_ascii=False,separators=(',',':'))
        c=f.to_crs(31982).union_all().centroid; c=gpd.GeoSeries([c],crs=31982).to_crs(4326).iloc[0]
        print(code,r.NM_MUN,len(feats),round(c.y,4),round(c.x,4))
