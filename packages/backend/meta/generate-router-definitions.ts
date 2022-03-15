import * as fs from "fs";
import * as path from "path";

function generateFunctionSignature(pathParams: string[], hasBody: boolean): string {
    const genericVariables = ["T", "U", "V", "S"];
    if (pathParams.length) {
        return `<${genericVariables
            .slice(0, pathParams.length)
            .map((gen) => `${gen} extends string`)
            .join(",")}>(${pathParams.map((v, i) => `${v}: ${genericVariables[i]}`)}${
            hasBody ? ", body: any" : ""
        }) => any`;
    }
    return "(body: any) => any";
}

function getVariables(route: string): string[] {
    return route
        .split("/")
        .filter((p) => p.startsWith(":"))
        .map((variable) => variable.substring(1));
}

const routerFileContents = fs.readFileSync(
    path.resolve(__dirname, "../src/api/routing.ts"),
    "utf-8",
);

const bodyRequests = [
    ...routerFileContents.matchAll(/router\.(post|delete|put)\((?:\s+)?"(.+)"/g),
].map(([, method, route]) => {
    const variables = getVariables(route);
    return `"${method}:${route}": ${generateFunctionSignature(variables, true)}`;
});

const getRequests = [...routerFileContents.matchAll(/router\.get\((?:\s+)?"(.+)"/g)].map(
    ([, route]) => {
        const variables = getVariables(route);
        return `"get:${route}": ${generateFunctionSignature(variables, true)}`;
    },
);

// eslint-disable-next-line prettier/prettier
const outputFile = 
`// Please do not modify this file it is generated by \`generate-router-definitions.ts\`
/* eslint-disable */ 

export interface PolyratingsBackendRouting {
${[...bodyRequests, ...getRequests].join(";\n")}
}
`;

fs.writeFileSync(path.resolve(__dirname, "../meta/generated.ts"), outputFile);
