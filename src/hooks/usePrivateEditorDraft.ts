import {useEffect,useMemo,useState}from"react";
import{useData}from"@/data/provider";
import{RegistrationGuestDraftRecovery}from"@/data/registrationGuestDraft";

export function usePrivateEditorDraft(key:string,initial:Record<string,string>){
 const adapter=useData();
 const recovery=useMemo(()=>new RegistrationGuestDraftRecovery({get:()=>adapter.editorDrafts.get(key),save:(_id,_key,draft)=>adapter.editorDrafts.save(key,draft)},"private",key,`beebizy:private:${adapter.cacheScope}:${key}`,{getItem:name=>localStorage.getItem(name),setItem:(name,value)=>localStorage.setItem(name,value)},adapter.kind==="memory",initial),
 // A query refresh must not overwrite unfinished form fields.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [adapter,key]);
 const[state,setState]=useState(recovery.state);
 useEffect(()=>{void recovery.start(setState);return()=>recovery.stop();},[recovery]);
 return{draft:state.values,state,recovery,setDraft:recovery.setValues.bind(recovery)};
}
