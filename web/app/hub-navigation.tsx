'use client';
import {MapPinned,LayoutDashboard,Map,ChartNoAxesCombined,Building2,Layers,House,Bookmark,Database,FileText,Compass,ChevronRight,FolderKanban} from 'lucide-react';
import {Sidebar,SidebarHeader,SidebarContent,SidebarFooter,SidebarGroup,SidebarGroupLabel,SidebarMenu,SidebarMenuItem,SidebarMenuButton,useSidebar} from '@/components/ui/sidebar';
import {cities} from '@/lib/domain';

const main = [
  ['overview', 'Visão executiva', LayoutDashboard],
  ['explore', 'Mapa de mercado', Map],
  ['territory', 'IBGE e bairros', Layers],
  ['dashboard', 'Evolução do mercado', ChartNoAxesCombined],
  ['projects', 'Empreendimentos', Building2],
  ['listings', 'Ofertas imobiliárias', House],
] as const;
const secondary = [
  ['portfolio', 'Projetos', FolderKanban],
  ['areas', 'Áreas salvas', Bookmark],
  ['rivals', 'Concorrência', Compass],
  ['reports', 'Relatórios', FileText],
  ['sources', 'Dados e fontes', Database],
] as const;
const states: Record<string, string> = {PR: 'Paraná', SP: 'São Paulo', MS: 'Mato Grosso do Sul'};
/** Cidades com base de anúncios publicada no site. */
export const citiesWithListings = ['Curitiba', 'Londrina'];

export default function HubNavigation({city, onCity, tab, onTab, projectCount = 0}: {city: string; onCity: (v: string) => void; tab: string; onTab: (v: string) => void; projectCount?: number}) {
  const {setOpenMobile, isMobile} = useSidebar();
  const navigate = (v: string) => {
    onTab(v);
    if (isMobile) setOpenMobile(false);
  };
  const current = cities.find((c) => c.name === city);
  const groups = [...new Set(cities.map((c) => c.uf))];
  const caption = [
    current?.mesh ? 'Bairros oficiais · Censo 2022' : 'Sem malha oficial de bairros',
    citiesWithListings.includes(city) ? 'anúncios publicados' : 'sem anúncios publicados',
  ].join(' · ');
  const item = ([id, label, Icon]: readonly [string, string, typeof Map]) => (
    <SidebarMenuItem key={id}>
      <SidebarMenuButton isActive={tab === id} onClick={() => navigate(id)}>
        <Icon size={18} />
        <span>{label}</span>
        {id === 'portfolio' && projectCount > 0 && <span className="nav-count">{projectCount}</span>}
        {tab === id && <ChevronRight className="nav-chevron" size={14} />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  return (
    <Sidebar className="hub-sidebar">
      <SidebarHeader>
        <div className="brand">
          <div className="brand-icon"><MapPinned size={23} /></div>
          <div><strong>HUB TERRITORIAL</strong><span>Inteligência de mercado</span></div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>SEU MERCADO</SidebarGroupLabel>
          <label className="city-picker">
            <span>Cidade de análise</span>
            <select aria-label="Cidade de análise" value={city} onChange={(e) => { onCity(e.target.value); if (isMobile) setOpenMobile(false); }}>
              {groups.map((uf) => (
                <optgroup key={uf} label={states[uf] || uf}>
                  {cities.filter((c) => c.uf === uf).map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="city-caption">{caption}</div>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>ANÁLISE</SidebarGroupLabel>
          <SidebarMenu>{main.map(item)}</SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>SEUS ESTUDOS</SidebarGroupLabel>
          <SidebarMenu>{secondary.map(item)}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="sidebar-footnote"><span className="live-dot" />Território. Mercado. Decisão.<small>Pesquisa imobiliária com fonte e data.</small></div>
      </SidebarFooter>
    </Sidebar>
  );
}
