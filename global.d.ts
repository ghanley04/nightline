// Let TypeScript know it’s okay to import platform-specific files
declare module "*.native.tsx";
declare module "*.web.tsx";


declare module '../../map/MyMap' {
  import { ComponentType } from 'react';
  const MyMap: ComponentType<any>;
  export default MyMap;
}
