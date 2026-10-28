declare module "jstat" {
  const jStat: {
    studentt: { cdf(value: number, degreesOfFreedom: number): number; inv(probability:number,degreesOfFreedom:number):number };
    centralF: { cdf(value: number, numeratorDf: number, denominatorDf: number): number };
  };
  export default jStat;
}
