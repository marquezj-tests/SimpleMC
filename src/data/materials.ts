import { Material, type XcomTable } from '../physics/material';
import Pb from './xcom/Pb.json';
import Fe from './xcom/Fe.json';
import H2O from './xcom/H2O.json';
import concrete from './xcom/concrete.json';

export const MATERIALS: Material[] = [Pb, Fe, H2O, concrete].map((t) => new Material(t as XcomTable));

export const materialById = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
