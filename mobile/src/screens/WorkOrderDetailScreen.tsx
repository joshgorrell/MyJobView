import React,{useState} from 'react';
import {View,Text,TouchableOpacity,Alert} from 'react-native';
import {useAuth} from '../contexts/AuthContext';
import {openMJV} from '../services/OpenMJV';

export default function WorkOrderDetailScreen({route}:any) {
  const {profile}=useAuth();const [opening,setOpening]=useState(false);
  async function open() {
    if(!profile || opening) return;
    setOpening(true);
    try {await openMJV(profile.id,{tab:'work_orders',workOrderId:route.params.workOrderId});}
    catch(error:any){Alert.alert('Unable to open Work Order',error.message);}
    finally{setOpening(false);}
  }
  return <View style={{flex:1,padding:20,backgroundColor:'#f3f4f6'}}>
    <Text style={{fontSize:22,fontWeight:'bold',color:'#111827'}}>Work Order</Text>
    <Text style={{marginVertical:16,color:'#374151'}}>Open the MJV Work Order for job time, parts, notes, photos and completion. Sign in to MJV in your browser if prompted.</Text>
    <TouchableOpacity disabled={opening} onPress={open} style={{padding:14,backgroundColor:'#2563eb',borderRadius:10}}><Text style={{color:'white',textAlign:'center'}}>{opening?'Opening…':'Open Work Order'}</Text></TouchableOpacity>
  </View>;
}
