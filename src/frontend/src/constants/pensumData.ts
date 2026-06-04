export interface Subject {
  code: string;
  name: string;
  theory_hours?: number;
  practice_hours?: number;
  lab_hours?: number;
  professors?: string[];
}

export interface Semester {
  number: number;
  subjects: Subject[];
}

export const pensumData: Semester[] = [
  {
    number: 1,
    subjects: [
      { code: "3307011103", name: "Física Aplicada I", professors: ["Prof. Ángel Gutiérrez"] },
      { code: "3307011105", name: "Matemática Aplicada I", professors: ["Prof. Zoraida Jiménez"] },
      { code: "3307011108", name: "Biología I", professors: ["Prof. Dailín Ruiz"] },
      { code: "3307011101", name: "Orientación Farmacéutica I", professors: ["Dr. Carlos Brito"] },
      { code: "3307012101", name: "Química Básica I", professors: ["Prof. Marla Mendoza"] },
      { code: "3307014213", name: "Botánica Aplicada I", professors: ["Dra. Mayra García"] },
    ]
  },
  {
    number: 2,
    subjects: [
      { code: "3307021104", name: "Física Aplicada II" },
      { code: "3307021106", name: "Matemática Aplicada II" },
      { code: "3307021109", name: "Biología II" },
      { code: "3307021102", name: "Orientación Farmacéutica II" },
      { code: "3307022102", name: "Química Básica II" },
      { code: "3307024214", name: "Botánica Aplicada II" },
    ]
  },
  {
    number: 3,
    subjects: [
      { code: "3307032211", name: "Análisis Químico I" },
      { code: "3307037101", name: "Estadística I" },
      { code: "3307038107", name: "Atención Farmacéutica I" },
      { code: "3307032213", name: "Fisicoquímica I" },
      { code: "3307033101", name: "Fisiología y Anatomía I" },
      { code: "3307033211", name: "Parasitología" },
      { code: "3307032103", name: "Química Inorgánica I" },
      { code: "3307032107", name: "Química Orgánica I" },
      { code: "3307031107", name: "Estudio y Comprensión del Hombre" },
    ]
  },
  {
    number: 4,
    subjects: [
      { code: "3307042212", name: "Análisis Químico II" },
      { code: "3307047102", name: "Estadística II" },
      { code: "3307048108", name: "Atención Farmacéutica II" },
      { code: "3307042214", name: "Fisicoquímica II" },
      { code: "3307043102", name: "Fisiología y Anatomía II" },
      { code: "3307047105", name: "Metodología de la Investigación" },
      { code: "3307042104", name: "Química Inorgánica II" },
      { code: "3307042108", name: "Química Orgánica II" },
    ]
  },
  {
    number: 5,
    subjects: [
      { code: "3307052209", name: "Análisis Instrumental I" },
      { code: "3307054101", name: "Bioquímica I" },
      { code: "3307055105", name: "Farmacotecnia I" },
      { code: "3307053103", name: "Fisiopatología I" },
      { code: "3307056107", name: "Legislación Farmacéutica I" },
      { code: "3307057103", name: "Diseño de Proyectos I" },
      { code: "3307052105", name: "Química Medicinal I" },
      { code: "3307053205", name: "Salud Pública I" },
    ]
  },
  {
    number: 6,
    subjects: [
      { code: "3307062210", name: "Análisis Instrumental II" },
      { code: "3307064102", name: "Bioquímica II" },
      { code: "3307065106", name: "Farmacotecnia II" },
      { code: "3307063104", name: "Fisiopatología II" },
      { code: "3307066108", name: "Legislación Farmacéutica II" },
      { code: "3307067104", name: "Diseño de Proyectos II" },
      { code: "3307062106", name: "Química Medicinal II" },
      { code: "3307063206", name: "Salud Pública II" },
    ]
  },
  {
    number: 7,
    subjects: [
      { code: "3307074209", name: "Biofarmacia I" },
      { code: "3307076101", name: "Economía Aplicada" },
      { code: "3307074107", name: "Farmacognosia I" },
      { code: "3307074103", name: "Farmacología I" },
      { code: "3307073207", name: "Microbiología I" },
      { code: "3307075103", name: "Procesos Unitarios I" },
      { code: "3307075109", name: "Higiene y Seguridad Industrial I" },
      { code: "3307074105", name: "Toxicología I" },
      { code: "3307078101", name: "Orientación Pasantías Oficina de Farmacia" },
    ]
  },
  {
    number: 8,
    subjects: [
      { code: "3307084210", name: "Biofarmacia II" },
      { code: "3307086102", name: "Administración Aplicada" },
      { code: "3307084108", name: "Farmacognosia II" },
      { code: "3307084104", name: "Farmacología II" },
      { code: "3307083208", name: "Microbiología II" },
      { code: "3307085104", name: "Procesos Unitarios II" },
      { code: "3307085110", name: "Seguridad e Higiene Industrial II" },
      { code: "3307084106", name: "Toxicología II" },
      { code: "3307088102", name: "Pasantías I Ofic. de Farmacia." },
    ]
  },
  {
    number: 9,
    subjects: [
      { code: "3307095101", name: "Bromatología I" },
      { code: "3307095107", name: "Farmacotecnia III" },
      { code: "3307094211", name: "Farmacoterapéutica I" },
      { code: "3307096103", name: "Mercadotecnia I" },
      { code: "3307098103", name: "Orientación Pasantías Industriales-Empresas" },
      { code: "3307093209", name: "Primeros Auxilios I" },
      { code: "3307096105", name: "Técnicas Gerenciales I" },
      { code: "3307098105", name: "Farmacia Hospitalaria I" },
      { code: "3307095111", name: "Dermocosmética I" },
      { code: "3307097106", name: "Seminario Trabajo Especial de Grado I" },
    ]
  },
  {
    number: 10,
    subjects: [
      { code: "3307105102", name: "Bromatología II" },
      { code: "3307105108", name: "Farmacotecnia IV" },
      { code: "3307104212", name: "Farmacoterapéutica II" },
      { code: "3307106104", name: "Mercadotecnia II" },
      { code: "3307108104", name: "Pasantías II Industriales-Empresas" },
      { code: "3307103210", name: "Primeros Auxilios II" },
      { code: "3307106106", name: "Técnicas Gerenciales II" },
      { code: "3307108106", name: "Farmacia Hospitalaria II" },
      { code: "3307105112", name: "Dermocosmética II" },
      { code: "3307107107", name: "Seminario Trabajo Especial de Grado II" },
      { code: "3307107108", name: "Trabajo Especial de Grado" },
    ]
  }
];
