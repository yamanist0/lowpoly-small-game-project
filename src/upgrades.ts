export type UpgradeId='dashCount'|'dashRecharge'|'shieldArea'|'shieldRecharge'|'health'|'run';
export const upgrades:{id:UpgradeId;name:string;detail:string}[]=[
 {id:'dashCount',name:'DASH CAPACITY',detail:'+1 dash charge per level'},
 {id:'dashRecharge',name:'DASH RECHARGE',detail:'-0.08s per level'},
 {id:'shieldArea',name:'SHIELD COVERAGE',detail:'+9 degrees per level'},
 {id:'shieldRecharge',name:'SHIELD RECHARGE',detail:'-0.4s per level'},
 {id:'health',name:'MAX HEALTH',detail:'+10 health per level'},
 {id:'run',name:'RUNNING',detail:'Hold SHIFT; +6% speed per level'}
];
export const upgradePrices=[3000,5000,8000];
export class Abilities {
 readonly levels:Record<UpgradeId,number>={dashCount:0,dashRecharge:0,shieldArea:0,shieldRecharge:0,health:0,run:0};
 charges=1;private recharge=0;
 get maxCharges(){return 1+this.levels.dashCount;}
 get dashInterval(){return .8-this.levels.dashRecharge*.08;}
 get shieldInterval(){return 5-this.levels.shieldRecharge*.4;}
 get shieldHalfAngle(){return Math.PI/3+this.levels.shieldArea*Math.PI/40;}
 get maxHealth(){return 100+this.levels.health*10;}
 get runSpeed(){return 4.5*(1+this.levels.run*.06);}
 get dashProgress(){return (this.charges+(this.charges<this.maxCharges?1-this.recharge/this.dashInterval:0))/this.maxCharges;}
 upgrade(id:UpgradeId){this.levels[id]++;if(id==='dashCount')this.charges++;}
 useDash(){if(this.charges<=0)return false;if(this.charges===this.maxCharges)this.recharge=this.dashInterval;this.charges--;return true;}
 tick(dt:number){if(this.charges>=this.maxCharges)return;this.recharge-=dt;while(this.recharge<=0&&this.charges<this.maxCharges){this.charges++;this.recharge+=this.dashInterval;}}
}
