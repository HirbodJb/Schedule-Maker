const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = [
  'ScheduleMaker/js/config.js',
  'ScheduleMaker/js/state.js',
  'ScheduleMaker/js/security.js',
  'ScheduleMaker/js/utils.js',
  'ScheduleMaker/js/tutors.js',
  'ScheduleMaker/js/cet.js'
].map(file=>fs.readFileSync(path.join(root, file), 'utf8')).join('\n');

const elements = new Map();
function element(){
  return {
    value:'', textContent:'', innerHTML:'', style:{}, dataset:{},
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    addEventListener(){}, remove(){}, appendChild(){}, querySelector(){return null;},
    querySelectorAll(){return [];}, focus(){}, select(){}, setAttribute(){}
  };
}

const context = {
  console,
  Blob,
  URL,
  setTimeout(callback){ callback(); return 1; },
  clearTimeout(){},
  window:{innerWidth:1280,innerHeight:800},
  document:{
    addEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    createElement(){return element();},
    body:element(),
    getElementById(id){
      if(!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  }
};
vm.createContext(context);

const test = `
function renderTutors(){}
function switchPane(){}
function resetRosterSearchResults(){}
function resetScheduleSearchResults(){}
function showConfirm(title,message,onConfirm){ onConfirm(); }

tutors = [{
  id:1,name:'Test Tutor',email:'test@example.edu',phone:'555-0100',notes:'Tutor note',
  eng101:'yes',hrs:12,other:0,mode:'both',sat:false,stable:'stable',priority:'agree',
  avail:{'Monday-9:00':true},assignedHrs:0,assignments:[],manual:false
}];
cetClasses = [{
  id:101,title:'ESL 8 · Section 12345',professor:'Test Professor',semester:'Fall 2026',
  section:'12345',status:'Regular',room:'Online Live',meetingDates:'08/31/2026 - 12/20/2026',
  requestNotes:'Requested tutor',sourceSchedule:'MoWe 9:00AM - 10:00AM',
  modality:'online-live',days:['Monday','Wednesday'],startTime:'9:00',endTime:'10:00',
  hrsPerWeek:2,studyGroupMode:'none',requiresStudyGroup:false,wantsCET:true,
  assignedTutorId:null,assignments:[{
    id:201,tutorId:1,days:['Monday'],startTime:'9:00',endTime:'10:00',weeklyHours:1,
    asyncCoursework:false,note:'Assignment note',sgStatus:'not-needed',sgPlacement:null,sgNote:''
  }]
}];

const saved = buildAppSnapshot();
cetClasses[0].title = 'Mutated after save';
if(saved.cetState.cetClasses[0].title !== 'ESL 8 · Section 12345') throw new Error('CET snapshot was not cloned');

clearAll();
if(tutors.length || cetClasses.length || currentSlots.length) throw new Error('Clear everything did not clear CET state');
restoreAppSnapshot(saved);

const restored = cetClasses[0];
if(tutors.length !== 1) throw new Error('Tutor did not restore');
if(cetClasses.length !== 1) throw new Error('CET class did not restore');
if(restored.requestNotes !== 'Requested tutor') throw new Error('CET notes did not restore');
if(restored.assignments.length !== 1) throw new Error('CET assignment did not restore');
if(restored.assignments[0].tutorId !== tutors[0].id) throw new Error('CET tutor link did not restore');
console.log('Project CET round-trip passed: 1 tutor, 1 CET class, 1 CET assignment.');
`;

vm.runInContext(`${source}\n${test}`, context, {filename:'project-cet-roundtrip.vm.js'});
