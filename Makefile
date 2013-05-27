id=iwhen.TypeScript
version=0.1.1-alpha
package=${id}.${version}.nupkg

.PHONY: pushnuget
pushnuget: nuget
	nuget push ${package}

.PHONY: nuget
nuget:
	nuget pack -Properties "Name=${id};Version=${version}" iwhen.nuspec

