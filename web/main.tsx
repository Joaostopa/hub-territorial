import React from 'react';
import {createRoot} from 'react-dom/client';
import Hub from './app/hub';
import './app/globals.css';
class Boundary extends React.Component<React.PropsWithChildren, {failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?<main style={{padding:32,fontFamily:'sans-serif'}}><h1>Não foi possível abrir o painel.</h1><p>Recarregue a página para tentar novamente. Seus estudos salvos permanecem neste navegador.</p><button onClick={()=>location.reload()}>Tentar novamente</button></main>:this.props.children}
}
createRoot(document.getElementById('root')!).render(<Boundary><Hub/></Boundary>);
